import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makePlan,
  seed,
  parseOrderMessage,
  readSavedState,
  crewSheet,
} from "./planning.ts";

test("morning example covers 126 orders with 18 packed and 108 harvested", () => {
  const p = makePlan(seed);
  assert.equal(p.target, 108);
  assert.equal(p.shortfall, 0);
  assert.equal(p.estimate, 117);
  assert.deepEqual(
    p.allocations.map((f) => f.boxes),
    [72, 36],
  );
  assert.ok(p.allocations.every((f) => f.crew === 6));
  assert.equal(p.allocations[0].finish, p.allocations[1].start);
  assert.ok(p.finish < seed.rainHour);
});
test("lower yield caps harvest and reports the unmet orders", () => {
  const state = structuredClone(seed);
  state.fields[0] = { ...state.fields[0], estimate: 40, low: 35, high: 45 };
  const p = makePlan(state);
  assert.equal(p.target, 79);
  assert.equal(p.shortfall, 29);
  assert.equal(
    p.allocations.reduce((n, f) => n + f.boxes, 0),
    p.target,
  );
});
test("early rain and reduced crew constrain the plan before packing", () => {
  const p = makePlan({ ...seed, crew: 2, rainHour: 10 });
  assert.equal(p.target, 16);
  assert.equal(p.shortfall, 92);
  assert.ok(p.finish <= 10);
});
test("packed inventory covering all orders needs no harvest or picking time", () => {
  const p = makePlan({ ...seed, packed: 130 });
  assert.equal(p.target, 0);
  assert.equal(p.finish, seed.startHour);
  assert.equal(p.shortfall, 0);
});
test("farmer override surfaces shortfalls and surplus, and respects capacity", () => {
  assert.equal(makePlan({ ...seed, target: 90 }).shortfall, 18);
  assert.equal(makePlan({ ...seed, target: 112 }).surplus, 4);
  assert.equal(makePlan({ ...seed, target: 999 }).target, 117);
});
test("message parsing requires recognizable quantity and sender", () => {
  assert.deepEqual(
    parseOrderMessage("Riverbend Kitchen: 24 boxes of tomatoes, please."),
    { customer: "Riverbend Kitchen", boxes: 24 },
  );
  assert.equal(parseOrderMessage("Need some tomatoes"), null);
  assert.equal(parseOrderMessage("Farm: 0 boxes"), null);
});
test("bad persisted data recovers to usable demo state", () => {
  assert.deepEqual(readSavedState("{broken"), seed);
  assert.deepEqual(readSavedState(JSON.stringify({ ...seed, crew: 0 })), seed);
  assert.deepEqual(readSavedState(JSON.stringify(seed)), seed);
});
test("crew sheet distinguishes approval from a draft and never implies sending", () => {
  assert.match(crewSheet(seed), /DRAFT PLAN/);
  assert.match(
    crewSheet({ ...seed, approvedAt: new Date().toISOString() }),
    /APPROVED PLAN/,
  );
  assert.match(crewSheet(seed), /does not send a message/);
  assert.match(crewSheet(seed), /Farmer-set harvest cutoff: 2:00 PM/);
  assert.doesNotMatch(crewSheet(seed), /Rain expected from/);
});
