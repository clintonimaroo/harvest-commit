import test from "node:test";
import assert from "node:assert/strict";
import { extractLocally, sampleMessages, smsBody } from "./messages.ts";
import { seed } from "./planning.ts";
test("amendment extracts the replacement total, retaining existing-order warning", () => {
  const result = extractLocally(sampleMessages[0].body, seed.orders);
  assert.equal(result.boxes, 36);
  assert.equal(result.intent, "amend");
  assert.equal(result.customer, "Riverbend Kitchen");
  assert.ok(result.warnings.some((w) => w.includes("32 boxes")));
});
test("ambiguous quantities and non-box units are not silently converted", () => {
  assert.equal(
    extractLocally("Cafe: 24 boxes today and 12 boxes tomorrow", []).boxes,
    null,
  );
  const weight = extractLocally("Cafe: 40 kg of tomatoes today", []);
  assert.equal(weight.boxes, null);
  assert.ok(
    weight.warnings.some((w) => w.includes("not automatically converted")),
  );
});
test("missing dates, crop, negation and cancellations stay explicit for review", () => {
  const result = extractLocally("Cafe: do not send 20 boxes", []);
  assert.equal(result.delivery, null);
  assert.equal(result.crop, null);
  assert.ok(result.warnings.some((w) => w.includes("negation")));
  assert.equal(
    extractLocally(
      "Riverbend Kitchen: cancel our tomato order today.",
      seed.orders,
    ).intent,
    "cancel",
  );
});
test("SMS includes downside risk, actionable reply codes, and the reduced-weather shortfall", () => {
  const initial = smsBody(seed, "AABBCC");
  assert.match(initial, /108 tomato boxes/);
  assert.match(initial, /4 boxes short/);
  assert.match(initial, /APPROVE AABBCC/);
  assert.match(initial, /SAMPLE FARM/);
  assert.match(initial, /Cutoff 2:00 PM/);
  assert.doesNotMatch(initial, /Rain 2:00 PM/);
  const rain = smsBody({ ...seed, rainHour: 12 }, "DDEEFF");
  assert.match(rain, /85 tomato boxes/);
  assert.match(rain, /23 boxes unfilled/);
});
