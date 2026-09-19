import test from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import twilio from "twilio";
import { createApp, MessageStore } from "./app.ts";
import type { Config } from "./app.ts";
import { seed } from "../src/lib/planning.ts";

const config: Config = {
  account: `AC${"a".repeat(32)}`,
  token: "test-token-not-a-real-credential",
  from: "+15005550006",
  service: `MG${"a".repeat(32)}`,
  campaign: `QE${"a".repeat(32)}`,
  farmer: "+15005550009",
  publicUrl: "https://farm.example",
  enabled: true,
  adminToken: "test-access-token-that-is-at-least-32-characters",
  apiKey: "",
  model: "",
};
async function fixture(
  t: test.TestContext,
  checkCampaign = async () => "VERIFIED",
) {
  const store = new MessageStore();
  let sent = 0;
  const app = createApp({
    config,
    store,
    checkCampaign,
    send: async () => ({
      sid: `SM${String(++sent).padStart(32, "0")}`,
      status: "queued",
    }),
  });
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No test port");
  const origin = `http://127.0.0.1:${address.port}`;
  const workspace = crypto.randomUUID();
  const post = async (
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ) =>
    fetch(origin + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  const proposal = (
    mode = "demo",
    revision = "v1",
    requestKey = crypto.randomUUID(),
  ) =>
    post("/api/sms/proposals", {
      workspace,
      revision,
      requestKey,
      mode,
      state: seed,
    });
  const webhook = async (
    path: string,
    values: Record<string, string>,
    sign = true,
  ) => {
    const params = { AccountSid: config.account, ...values };
    return fetch(origin + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        ...(sign
          ? {
              "X-Twilio-Signature": twilio.getExpectedTwilioSignature(
                config.token,
                config.publicUrl + path,
                params,
              ),
            }
          : {}),
      },
      body: new URLSearchParams(params),
    });
  };
  return {
    store,
    origin,
    workspace,
    post,
    proposal,
    webhook,
    sent: () => sent,
  };
}
test("demo approvals require the exact plan code, are idempotent, and never send SMS", async (t) => {
  const f = await fixture(t);
  const p = await (await f.proposal()).json();
  assert.match(p.body, /Low-yield risk: 4 boxes short/);
  await f.post("/api/sms/demo-reply", {
    workspace: f.workspace,
    body: "APPROVE BADBAD",
  });
  assert.equal(f.store.data.proposals[0].phase, "pending");
  await f.post("/api/sms/demo-reply", {
    workspace: f.workspace,
    body: `APPROVE ${p.code}`,
  });
  const approvedAt = f.store.data.proposals[0].approvedAt;
  await f.post("/api/sms/demo-reply", {
    workspace: f.workspace,
    body: `APPROVE ${p.code}`,
  });
  assert.equal(f.store.data.proposals[0].phase, "approved");
  assert.equal(f.store.data.proposals[0].approvedAt, approvedAt);
  assert.equal(f.sent(), 0);
});
test("edits stay unapproved, enforce capacity, and changed plans reject stale replies", async (t) => {
  const f = await fixture(t);
  const p = await (await f.proposal()).json();
  await f.post("/api/sms/demo-reply", {
    workspace: f.workspace,
    body: `EDIT ${p.code} 999`,
  });
  assert.equal(f.store.data.proposals[0].phase, "pending");
  await f.post("/api/sms/demo-reply", {
    workspace: f.workspace,
    body: `EDIT ${p.code} 100`,
  });
  assert.equal(f.store.data.proposals[0].phase, "changes_requested");
  assert.equal(f.store.data.proposals[0].requestedTarget, 100);
  await f.post("/api/sms/demo-reply", {
    workspace: f.workspace,
    body: `APPROVE ${p.code}`,
  });
  assert.equal(f.store.data.proposals[0].phase, "changes_requested");
  await f.post("/api/sms/invalidate", {
    workspace: f.workspace,
    revision: "v2",
  });
  await f.post("/api/sms/demo-reply", {
    workspace: f.workspace,
    body: `APPROVE ${p.code}`,
  });
  assert.equal(f.store.data.proposals[0].phase, "superseded");
});
test("live send is once per request key and duplicate signed deliveries do not repeat approval", async (t) => {
  const f = await fixture(t);
  const key = crypto.randomUUID();
  const p = await (await f.proposal("live", "v1", key)).json();
  await f.proposal("live", "v1", key);
  assert.equal(f.sent(), 1);
  const values = {
    MessageSid: `SM${"b".repeat(32)}`,
    From: config.farmer,
    Body: `APPROVE ${p.code}`,
  };
  assert.equal(
    (await f.webhook("/webhooks/twilio/inbound", values, false)).status,
    403,
  );
  assert.equal(f.store.data.proposals[0].phase, "pending");
  const forgedSender = {
    ...values,
    From: "+15005550001",
    MessageSid: `SM${"c".repeat(32)}`,
  };
  await f.webhook("/webhooks/twilio/inbound", forgedSender);
  assert.equal(f.store.data.proposals[0].phase, "pending");
  await f.webhook("/webhooks/twilio/inbound", values);
  const stamp = f.store.data.proposals[0].approvedAt;
  const duplicate = await f.webhook("/webhooks/twilio/inbound", values);
  assert.equal(f.store.data.proposals[0].phase, "approved");
  assert.equal(f.store.data.proposals[0].approvedAt, stamp);
  assert.doesNotMatch(await duplicate.text(), /<Message>/);
});
test("buyer texts land once in the inbox and never alter the plan", async (t) => {
  const f = await fixture(t);
  const values = {
    MessageSid: `SM${"d".repeat(32)}`,
    From: "+15005550001",
    Body: "Riverbend Kitchen: change our order to 36 boxes of tomatoes today.",
  };
  const response = await f.webhook("/webhooks/twilio/inbound", values);
  await f.webhook("/webhooks/twilio/inbound", values);
  assert.equal(f.store.data.inbox.length, 1);
  assert.equal(f.store.data.inbox[0].body, values.Body);
  assert.equal(f.store.data.proposals.length, 0);
  assert.doesNotMatch(await response.text(), /<Message>/);
});
test("delivery callbacks cannot regress delivered status; STOP prevents further sending", async (t) => {
  const f = await fixture(t);
  await f.proposal("live");
  const sid = f.store.data.proposals[0].sid!;
  await f.webhook("/webhooks/twilio/status", {
    MessageSid: sid,
    MessageStatus: "delivered",
  });
  await f.webhook("/webhooks/twilio/status", {
    MessageSid: sid,
    MessageStatus: "sent",
  });
  assert.equal(f.store.data.proposals[0].delivery, "delivered");
  await f.webhook("/webhooks/twilio/inbound", {
    MessageSid: `SM${"e".repeat(32)}`,
    From: config.farmer,
    Body: "STOP",
    OptOutType: "STOP",
  });
  assert.equal((await f.proposal("live")).status, 409);
  assert.equal(f.sent(), 1);
  await f.webhook("/webhooks/twilio/inbound", {
    MessageSid: `SM${"f".repeat(32)}`,
    From: config.farmer,
    Body: "START",
    OptOutType: "START",
  });
  assert.equal((await f.proposal("live")).status, 201);
});
test("Twilio consent aliases update the local block state without duplicate replies", async (t) => {
  const f = await fixture(t);
  const controls: [string, boolean][] = [
    ["STOP", true],
    ["YES", false],
    ["OPTOUT", true],
    ["UNSTOP", false],
    ["REVOKE", true],
    ["START", false],
    ["INFO", false],
  ];
  for (const [index, [body, blocked]] of controls.entries()) {
    const response = await f.webhook("/webhooks/twilio/inbound", {
      MessageSid: `SM${index.toString(16).padStart(32, "0")}`,
      From: config.farmer,
      Body: body,
    });
    assert.equal(f.store.data.optedOut, blocked);
    assert.doesNotMatch(await response.text(), /<Message>/);
  }
  assert.equal(f.store.data.inbox.length, 0);
  assert.equal(f.sent(), 0);
});
test("live sending requires fresh campaign approval, and provider failures fail closed", async (t) => {
  let status = "IN_PROGRESS";
  const f = await fixture(t, async () => {
    if (status === "UNAVAILABLE") throw Error("Provider unavailable");
    return status;
  });
  const pending = await (
    await fetch(`${f.origin}/api/messaging?workspace=${f.workspace}`)
  ).json();
  assert.equal(pending.ready, false);
  assert.ok(["CHECKING", "IN_PROGRESS"].includes(pending.campaignStatus));
  for (const next of ["IN_PROGRESS", "PENDING", "FAILED", "UNAVAILABLE"]) {
    status = next;
    assert.equal((await f.proposal("live")).status, 409);
  }
  assert.equal(f.sent(), 0);
  status = "VERIFIED";
  assert.equal((await f.proposal("live")).status, 201);
  assert.equal(f.sent(), 1);
  // A previously approved, cached status cannot authorize another send after revocation.
  status = "FAILED";
  assert.equal((await f.proposal("live")).status, 409);
  assert.equal(f.sent(), 1);
  assert.equal((await f.proposal("demo")).status, 201);
});
test("public admin requests and invalid planning inputs cannot trigger sending", async (t) => {
  const f = await fixture(t);
  const denied = await fetch(
    `${f.origin}/api/messaging?workspace=${f.workspace}`,
    { headers: { Host: "farm.example", "X-Forwarded-For": "203.0.113.4" } },
  );
  assert.equal(denied.status, 401);
  const allowed = await fetch(
    `${f.origin}/api/messaging?workspace=${f.workspace}`,
    {
      headers: {
        Host: "farm.example",
        "X-Forwarded-For": "203.0.113.4",
        Authorization: `Bearer ${config.adminToken}`,
      },
    },
  );
  assert.equal(allowed.status, 200);
  const bad = await f.post("/api/sms/proposals", {
    workspace: f.workspace,
    revision: "v1",
    requestKey: crypto.randomUUID(),
    mode: "live",
    state: { ...seed, crew: -1 },
  });
  assert.equal(bad.status, 400);
  assert.equal(f.sent(), 0);
  const csrf = await f.post(
    "/api/sms/demo-reply",
    { workspace: f.workspace, body: "APPROVE ABC123" },
    { Origin: "https://untrusted.example" },
  );
  assert.equal(csrf.status, 403);
});

test("inbox snapshots and incoming changes never wait for a slow carrier approval check", async (t) => {
  const f = await fixture(t, () => new Promise<string>(() => {}));
  const first = await fetch(
    `${f.origin}/api/messaging?workspace=${f.workspace}`,
    { signal: AbortSignal.timeout(1000) },
  );
  assert.equal(first.status, 200);
  const before = await first.json();
  assert.equal(before.campaignStatus, "CHECKING");
  assert.equal(before.ready, false);
  assert.equal(before.inbox.length, 0);
  let completed = false;
  const waiting = fetch(
    `${f.origin}/api/messaging?workspace=${f.workspace}&after=${before.syncRevision}`,
    { signal: AbortSignal.timeout(2000) },
  )
    .then((r) => r.json())
    .then((data) => {
      completed = true;
      return data;
    });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(completed, false, "An unchanged inbox holds its response open");
  const incoming = {
    MessageSid: `SM${"9".repeat(32)}`,
    From: "+15005550001",
    Body: "Realtime test: 12 boxes of tomatoes today.",
  };
  await f.webhook("/webhooks/twilio/inbound", incoming);
  const after = await waiting;
  assert.notEqual(after.syncRevision, before.syncRevision);
  assert.equal(after.inbox[0].id, incoming.MessageSid);
  assert.equal(after.campaignStatus, "CHECKING");
  assert.equal(f.sent(), 0);
  assert.equal(f.store.data.proposals.length, 0);
  // Reconnecting with an old revision returns the missed message immediately.
  const recovered = await (
    await fetch(
      `${f.origin}/api/messaging?workspace=${f.workspace}&after=${before.syncRevision}`,
      { signal: AbortSignal.timeout(1000) },
    )
  ).json();
  assert.equal(recovered.inbox.length, 1);
});

test("long-poll requests remain authenticated and cancelled connections remove their listeners", async (t) => {
  const f = await fixture(t, () => new Promise<string>(() => {}));
  let listeners = 0;
  const subscribe = f.store.subscribe.bind(f.store);
  f.store.subscribe = (listener) => {
    listeners++;
    const remove = subscribe(listener);
    return () => {
      listeners--;
      remove();
    };
  };
  const before = await (
    await fetch(`${f.origin}/api/messaging?workspace=${f.workspace}`)
  ).json();
  const url = `${f.origin}/api/messaging?workspace=${f.workspace}&after=${before.syncRevision}`;
  const denied = await fetch(url, {
    headers: { Host: "farm.example", "X-Forwarded-For": "203.0.113.4" },
  });
  assert.equal(denied.status, 401);
  assert.equal(listeners, 0);
  const abort = new AbortController();
  const pending = fetch(url, { signal: abort.signal }).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(listeners, 1);
  abort.abort();
  await pending;
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(listeners, 0);
});
