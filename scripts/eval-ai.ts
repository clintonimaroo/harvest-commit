import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { createApp, loadConfig, MessageStore } from "../server/app.ts";
import { sampleMessages } from "../src/lib/messages.ts";
import type { ExtractedOrder } from "../src/lib/messages.ts";
import { seed } from "../src/lib/planning.ts";

// A live integration evaluation, not a unit test or a simulated model response.
const config = loadConfig();
if (!config.apiKey || !config.model) {
  console.error(
    "NOT RUN: set OPENAI_API_KEY and OPENAI_MODEL in the private .env file.",
  );
  process.exit(1);
}
const cases = [
  {
    name: "Amendment",
    source: "Original built-in sample",
    body: sampleMessages[0].body,
    expected: {
      customer: "Riverbend Kitchen",
      boxes: 36,
      intent: "amend",
      crop: "tomatoes",
      delivery: "today",
    },
    warning: false,
  },
  {
    name: "New order",
    source: "Original built-in sample",
    body: sampleMessages[1].body,
    expected: {
      customer: "Corner Cafe",
      boxes: 12,
      intent: "new",
      crop: "tomatoes",
      delivery: "today",
    },
    warning: false,
  },
  {
    name: "Cancellation",
    source: "Synthetic edge case",
    body: "Riverbend Kitchen: please cancel our 32-box tomato order for today.",
    expected: {
      customer: "Riverbend Kitchen",
      boxes: 0,
      intent: "cancel",
      crop: "tomato",
      delivery: "today",
    },
    warning: false,
  },
  {
    name: "Missing information",
    source: "Synthetic edge case",
    body: "Can we get tomatoes?",
    expected: { customer: null, boxes: null, crop: "tomatoes", delivery: null },
    warning: true,
  },
  {
    name: "Ambiguous units",
    source: "Synthetic edge case",
    body: "Corner Cafe: can we have 12 crates of tomatoes for today?",
    expected: {
      customer: "Corner Cafe",
      boxes: null,
      intent: "new",
      crop: "tomatoes",
      delivery: "today",
    },
    warning: true,
  },
  {
    name: "Relative amendment",
    source: "Synthetic edge case",
    body: "Riverbend Kitchen: add 4 boxes of tomatoes to our order for today.",
    expected: {
      customer: "Riverbend Kitchen",
      boxes: null,
      intent: "amend",
      crop: "tomatoes",
      delivery: "today",
    },
    warning: true,
  },
  {
    name: "Negated cancellation",
    source: "Synthetic edge case",
    body: "Riverbend Kitchen: do not cancel. Keep our order at 32 boxes of tomatoes for today.",
    expected: {
      customer: "Riverbend Kitchen",
      boxes: 32,
      crop: "tomatoes",
      delivery: "today",
    },
    notIntent: "cancel",
    warning: true,
  },
  {
    name: "Multiple orders",
    source: "Synthetic edge case",
    body: "Riverbend Kitchen needs 10 boxes of tomatoes today. Corner Cafe needs 12 boxes of tomatoes today.",
    expected: {
      customer: null,
      boxes: null,
      intent: "unclear",
      crop: null,
      delivery: null,
    },
    warning: true,
  },
];

const store = new MessageStore();
const app = createApp({
  config: { ...config, enabled: false },
  store,
  send: async () => {
    throw new Error("Evaluation must never send SMS");
  },
});
const server = await new Promise<Server>((resolve) => {
  const s = app.listen(0, "127.0.0.1", () => resolve(s));
});
const address = server.address();
if (!address || typeof address === "string")
  throw new Error("No evaluation port");
const origin = `http://127.0.0.1:${address.port}`;
const startedAt = new Date().toISOString();
const results: {
  name: string;
  source: string;
  body: string;
  expected: unknown;
  passed: boolean;
  failures: string[];
  result: unknown;
}[] = [];
try {
  for (const c of cases) {
    const failures: string[] = [];
    let result: unknown;
    try {
      const response = await fetch(origin + "/api/orders/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          body: c.body,
          orders: seed.orders.map(({ id, customer, boxes }) => ({
            id,
            customer,
            boxes,
          })),
          useAI: true,
        }),
      });
      result = await response.json();
      assert.equal(
        response.status,
        200,
        `HTTP ${response.status}: ${(result as { error?: string }).error || "request failed"}`,
      );
      const actual = result as ExtractedOrder;
      assert.equal(
        actual.method,
        "ai",
        "Must be a real model result, not a parser fallback",
      );
      assert.equal(actual.evidence?.provider, "openai");
      assert.ok(
        actual.evidence?.responseId.startsWith("resp_"),
        "OpenAI response ID required",
      );
      assert.ok(actual.evidence?.model, "Actual response model required");
      for (const [field, value] of Object.entries(c.expected)) {
        const found = actual[field as keyof ExtractedOrder];
        // Delivery wording may include "for" from the original source.
        const normalized =
          typeof found === "string"
            ? field === "delivery"
              ? found.toLowerCase().replace(/^for\s+/, "")
              : found.toLowerCase()
            : found;
        const expected =
          typeof value === "string" ? value.toLowerCase() : value;
        if (normalized !== expected)
          failures.push(
            `${field}: expected ${JSON.stringify(value)}, got ${JSON.stringify(found)}`,
          );
      }
      if (c.notIntent && actual.intent === c.notIntent)
        failures.push(`intent must not be ${c.notIntent}`);
      if (c.warning && actual.warnings.length === 0)
        failures.push(
          "Expected a model warning for missing or uncertain information",
        );
    } catch (error) {
      failures.push(
        error instanceof Error ? error.message : "Evaluation request failed",
      );
    }
    results.push({
      name: c.name,
      source: c.source,
      body: c.body,
      expected: c.expected,
      passed: failures.length === 0,
      failures,
      result,
    });
    console.log(
      `${failures.length ? "FAIL" : "PASS"}: ${c.name}${failures.length ? " — " + failures.join("; ") : ""}`,
    );
    // Stop rather than make more requests with invalid credentials or exhausted quota.
    if (
      (result as { error?: string })?.error?.match(
        /credentials|usage or rate limit/,
      )
    )
      break;
  }
  assert.deepEqual(
    store.data,
    { proposals: [], inbox: [], seen: [], optedOut: false },
    "Extraction must not change orders or send messages",
  );
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
const passed = results.filter((r) => r.passed).length;
const report = {
  startedAt,
  completedAt: new Date().toISOString(),
  transport: "Live OpenAI Responses API via POST /api/orders/extract",
  configuredModel: config.model,
  total: cases.length,
  executed: results.length,
  passed,
  storeUnchanged: true,
  results,
};
const path = "work/ai-validation";
mkdirSync(path, { recursive: true, mode: 0o700 });
writeFileSync(`${path}/results.json`, JSON.stringify(report, null, 2) + "\n", {
  mode: 0o600,
});
console.log(
  `${passed}/${cases.length} live cases passed. Evidence saved to ${path}/results.json. No SMS sent or real orders changed.`,
);
process.exitCode = passed === cases.length ? 0 : 1;
