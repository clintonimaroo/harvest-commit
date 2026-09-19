import test from "node:test";
import assert from "node:assert/strict";
import { createFarmSync } from "./farm-sync.ts";
import type { SaveFarm } from "./farm-sync.ts";
import { seed } from "./planning.ts";
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
test("cloud saves serialize edits and retry an uncertain save with the same idempotency key", async () => {
  const saves: SaveFarm[] = [];
  const statuses: string[] = [];
  const initial = {
    workspace: crypto.randomUUID(),
    version: "v1",
    state: structuredClone(seed),
  };
  const sync = createFarmSync({
    initial,
    retryMs: 5,
    onStatus: (s) => statuses.push(s),
    push: async (save) => {
      saves.push(structuredClone(save));
      if (saves.length === 1) throw Error("Lost acknowledgement");
      return { workspace: save.workspace, state: save.state, version: "v2" };
    },
  });
  sync.update({ ...seed, packed: 20 });
  await pause(290);
  assert.equal(saves.length, 2);
  assert.equal(saves[0].mutationId, saves[1].mutationId);
  assert.equal(statuses.at(-1), "Saved online");
  sync.stop();
});
test("cloud conflicts keep the draft and stop automatic overwrites", async () => {
  let calls = 0;
  let status = "";
  const sync = createFarmSync({
    initial: { workspace: crypto.randomUUID(), version: "v1", state: seed },
    retryMs: 5,
    onStatus: (s) => {
      status = s;
    },
    push: async () => {
      calls++;
      throw Object.assign(new Error("Conflict"), { status: 409 });
    },
  });
  sync.update({ ...seed, packed: 20 });
  await pause(280);
  sync.update({ ...seed, packed: 30 });
  await pause(280);
  assert.equal(calls, 1);
  assert.match(status, /another device/);
  sync.stop();
});
