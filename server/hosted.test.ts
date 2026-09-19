import test from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import twilio from "twilio";
import { createApp } from "./app.ts";
import type { Config } from "./app.ts";
import { MessageStore, RedisStore } from "./store.ts";
import type { Store } from "./store.ts";
import { seed } from "../src/lib/planning.ts";

const config: Config = {
  account: `AC${"a".repeat(32)}`,
  token: "fake-twilio-token",
  from: "+15005550006",
  service: `MG${"b".repeat(32)}`,
  campaign: `QE${"c".repeat(32)}`,
  farmer: "+15005550009",
  publicUrl: "https://farm.example",
  enabled: true,
  adminToken: "test-key-that-is-long-enough-for-a-private-workspace",
  apiKey: "",
  model: "",
};
function database() {
  let value: string | null = null;
  const make = () => {
    const store = new RedisStore("https://redis.example", "fake-token");
    store.command = async <T>(...args: (string | number)[]): Promise<T> => {
      if (args[0] === "GET") return value as T;
      if (args[0] === "EVAL") {
        if ((value || "") !== args[4]) return 0 as T;
        value = args[5] as string;
        return 1 as T;
      }
      throw Error("Unexpected command");
    };
    return store;
  };
  return { make };
}
async function fixture(
  t: test.TestContext,
  store: Store,
  send = async () => ({ sid: `SM${"f".repeat(32)}`, status: "queued" }),
) {
  const app = createApp({
    config,
    store,
    hosted: true,
    send,
    checkCampaign: async () => "VERIFIED",
  });
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Missing port");
  const origin = `http://127.0.0.1:${address.port}`;
  const post = (path: string, body: unknown, authorized = true) =>
    fetch(origin + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authorized ? { Authorization: `Bearer ${config.adminToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
  return { origin, post };
}
test("shared storage preserves concurrent writes and data across new instances", async () => {
  const db = database();
  const a = db.make();
  const b = db.make();
  await Promise.all([
    a.change((d) => {
      d.seen.push("first");
    }),
    b.change((d) => {
      d.seen.push("second");
    }),
  ]);
  assert.deepEqual((await db.make().read()).data.seen.sort(), [
    "first",
    "second",
  ]);
});
test("simultaneous sends with one request key across two instances send exactly once", async (t) => {
  const db = database();
  let sent = 0;
  const transport = async () => {
    sent++;
    await new Promise((r) => setTimeout(r, 30));
    return { sid: `SM${"f".repeat(32)}`, status: "queued" };
  };
  const a = await fixture(t, db.make(), transport);
  const b = await fixture(t, db.make(), transport);
  const input = {
    workspace: crypto.randomUUID(),
    revision: "v1",
    requestKey: crypto.randomUUID(),
    mode: "live",
    state: seed,
  };
  const responses = await Promise.all([
    a.post("/api/sms/proposals", input),
    b.post("/api/sms/proposals", input),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 201]);
  assert.equal(sent, 1);
  assert.equal((await db.make().read()).data.proposals.length, 1);
});
test("concurrent repeated signed webhooks appear once in a different instance", async (t) => {
  const db = database();
  const a = await fixture(t, db.make());
  const b = await fixture(t, db.make());
  const params = {
    AccountSid: config.account,
    From: "+15005550001",
    Body: "Cloud test order",
    MessageSid: `SM${"1".repeat(32)}`,
  };
  const path = "/webhooks/twilio/inbound";
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": twilio.getExpectedTwilioSignature(
        config.token,
        config.publicUrl + path,
        params,
      ),
    },
    body: new URLSearchParams(params),
  };
  await Promise.all([
    fetch(a.origin + path, options),
    fetch(b.origin + path, options),
  ]);
  const snapshot = await db.make().read();
  assert.equal(snapshot.data.inbox.length, 1);
  assert.equal(snapshot.data.seen.length, 1);
});
test("hosted workspace refuses anonymous access, accepts signed sessions, and rejects forged cookies", async (t) => {
  const f = await fixture(t, new MessageStore());
  assert.equal((await fetch(f.origin + "/api/farm")).status, 401);
  assert.equal(
    (await f.post("/auth/login", { key: "wrong" }, false)).status,
    401,
  );
  const login = await f.post("/auth/login", { key: config.adminToken }, false);
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")!;
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal(
    (
      await fetch(f.origin + "/api/farm", {
        headers: { Cookie: cookie.split(";")[0] },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(f.origin + "/api/farm", {
        headers: { Cookie: cookie.split(";")[0] + "forged" },
      })
    ).status,
    401,
  );
  const csrf = await fetch(f.origin + "/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://other.example",
    },
    body: JSON.stringify({ key: config.adminToken }),
  });
  assert.equal(csrf.status, 403);
});
test("farm saves reject stale edits, preserve Trash, and recover a retried save without duplication", async (t) => {
  const store = new MessageStore();
  const f = await fixture(t, store);
  const input = {
    workspace: crypto.randomUUID(),
    baseVersion: null,
    mutationId: crypto.randomUUID(),
    state: {
      ...seed,
      revision: "v1",
      deletedMessages: ["sample-message-amend"],
    },
  };
  const first = await (await f.post("/api/farm", input)).json();
  const again = await (await f.post("/api/farm", input)).json();
  assert.equal(first.version, again.version);
  assert.deepEqual(store.data.farm?.state.deletedMessages, [
    "sample-message-amend",
  ]);
  assert.equal(
    (await f.post("/api/farm", { ...input, mutationId: crypto.randomUUID() }))
      .status,
    409,
  );
  assert.equal(
    (
      await f.post("/api/farm", {
        ...input,
        baseVersion: first.version,
        mutationId: crypto.randomUUID(),
        state: { ...seed, revision: "v2" },
      })
    ).status,
    200,
  );
});
