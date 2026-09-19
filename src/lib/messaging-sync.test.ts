import test from "node:test";
import assert from "node:assert/strict";
import { createMessagingSync } from "./messaging-sync.ts";

type Snapshot = { syncRevision: string; inbox: string[] };
type Pending = {
  after?: string;
  signal: AbortSignal;
  resolve: (data: Snapshot) => void;
  reject: (error: Error) => void;
};
const turn = () => new Promise((resolve) => setImmediate(resolve));
function fixture(t: test.TestContext, respectAbort = true) {
  const requests: Pending[] = [];
  const data: Snapshot[] = [];
  const errors: Error[] = [];
  const sync = createMessagingSync<Snapshot>({
    fetchSnapshot: (after, signal) =>
      new Promise((resolve, reject) => {
        requests.push({ after, signal, resolve, reject });
        if (respectAbort)
          signal.addEventListener("abort", () => reject(new Error("Aborted")), {
            once: true,
          });
      }),
    onData: (snapshot) => data.push(snapshot),
    onError: (error) => errors.push(error),
    retryMs: 10,
  });
  t.after(() => sync.stop());
  sync.start();
  return { requests, data, errors, sync };
}

test("receiving a new server revision updates the inbox without a refresh or interval", async (t) => {
  const f = fixture(t);
  assert.equal(f.requests.length, 1);
  f.requests[0].resolve({ syncRevision: "one", inbox: [] });
  await turn();
  assert.equal(f.requests[1].after, "one");
  f.requests[1].resolve({ syncRevision: "two", inbox: ["arrived"] });
  await turn();
  assert.deepEqual(f.data.at(-1)?.inbox, ["arrived"]);
  assert.equal(f.requests[2].after, "two");
  assert.equal(f.errors.length, 0);
});

test("a focus/reconnect refresh cancels the waiting request and takes a fresh snapshot", async (t) => {
  const f = fixture(t);
  f.requests[0].resolve({ syncRevision: "one", inbox: [] });
  await turn();
  const refreshed = f.sync.refresh();
  await turn();
  assert.equal(f.requests[1].signal.aborted, true);
  assert.equal(f.requests[2].after, undefined);
  f.requests[2].resolve({ syncRevision: "two", inbox: ["missed while away"] });
  await refreshed;
  assert.deepEqual(f.data.at(-1)?.inbox, ["missed while away"]);
  assert.equal(f.errors.length, 0);
});

test("an old response arriving after refresh cannot overwrite current data", async (t) => {
  const f = fixture(t, false);
  const refreshed = f.sync.refresh();
  f.requests[0].resolve({ syncRevision: "stale", inbox: ["stale"] });
  await turn();
  assert.equal(f.data.length, 0);
  f.requests[1].resolve({ syncRevision: "current", inbox: ["current"] });
  await refreshed;
  assert.equal(f.data.length, 1);
  assert.equal(f.data[0].syncRevision, "current");
});

test("a dropped connection reports the issue and retries automatically", async (t) => {
  const f = fixture(t);
  f.requests[0].reject(new Error("Server unavailable"));
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(f.errors[0].message, "Server unavailable");
  assert.equal(f.requests.length, 2);
  f.requests[1].resolve({
    syncRevision: "reconnected",
    inbox: ["new message"],
  });
  await turn();
  assert.equal(f.data.at(-1)?.syncRevision, "reconnected");
});

test("stopping the sync cancels its request and prevents further updates", async (t) => {
  const f = fixture(t, false);
  f.sync.stop();
  assert.equal(f.requests[0].signal.aborted, true);
  f.requests[0].resolve({ syncRevision: "late", inbox: [] });
  await turn();
  assert.equal(f.data.length, 0);
  assert.equal(f.requests.length, 1);
});
