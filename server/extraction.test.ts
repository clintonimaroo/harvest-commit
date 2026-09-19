import test from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { createApp, loadConfig, MessageStore } from "./app.ts";
import { extractWithOpenAI, ExtractionError } from "./extraction.ts";
import { sampleMessages } from "../src/lib/messages.ts";
import { seed } from "../src/lib/planning.ts";

// All transports here are test doubles. Only npm run eval:ai calls a real model.
const fields = {
  customer: "Riverbend Kitchen",
  boxes: 36,
  crop: "tomatoes",
  delivery: "today",
  intent: "amend",
  warnings: [],
};
const envelope = (text = JSON.stringify(fields)) => ({
  id: "resp_unit_test_only",
  model: "test-model",
  status: "completed",
  output: [{ type: "message", content: [{ type: "output_text", text }] }],
  usage: { input_tokens: 50, output_tokens: 30 },
});
const input = {
  body: sampleMessages[0].body,
  customers: ["Riverbend Kitchen"],
  apiKey: "test-key-not-real",
  model: "test-model",
};

test("model adapter keeps provider fields and evidence separate from parser output (mock transport)", async () => {
  const result = await extractWithOpenAI({
    ...input,
    transport: async (url, init) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      const payload = JSON.parse(String(init?.body));
      assert.equal(payload.store, false);
      assert.equal(payload.text.format.strict, true);
      assert.deepEqual(JSON.parse(payload.input), {
        source: input.body,
        knownCustomers: ["Riverbend Kitchen"],
      });
      return Response.json(envelope(), {
        headers: { "x-request-id": "req_unit_test_only" },
      });
    },
  });
  assert.equal(result.method, "ai");
  assert.deepEqual(
    result.warnings,
    [],
    "No local parser warnings may be mislabeled as model output",
  );
  assert.equal(result.evidence?.model, "test-model");
  assert.equal(result.evidence?.responseId, "resp_unit_test_only");
  assert.equal(result.evidence?.requestId, "req_unit_test_only");
});

for (const [name, payload] of [
  ["incomplete response", { ...envelope(), status: "incomplete" }],
  ["invalid JSON", envelope("not JSON")],
  ["invalid quantity", envelope(JSON.stringify({ ...fields, boxes: -1 }))],
  [
    "unsupported extra field",
    envelope(JSON.stringify({ ...fields, approve: true })),
  ],
  [
    "inconsistent cancellation",
    envelope(JSON.stringify({ ...fields, intent: "cancel", boxes: 32 })),
  ],
  [
    "refusal",
    {
      ...envelope(),
      output: [
        {
          type: "message",
          content: [{ type: "refusal", refusal: "Declined" }],
        },
      ],
    },
  ],
  ["missing provenance", { ...envelope(), id: undefined }],
] as const) {
  test(`rejects ${name} without passing off parser output as AI (mock transport)`, async () => {
    await assert.rejects(
      extractWithOpenAI({
        ...input,
        transport: async () => Response.json(payload),
      }),
      ExtractionError,
    );
  });
}

test("provider authentication failures and network errors never expose secrets or return local results", async () => {
  await assert.rejects(
    extractWithOpenAI({
      ...input,
      transport: async () =>
        Response.json({ error: "SECRET-provider-detail" }, { status: 401 }),
    }),
    (error: unknown) => {
      assert.ok(error instanceof ExtractionError);
      assert.match(error.message, /credentials/);
      assert.doesNotMatch(error.message, /SECRET/);
      return true;
    },
  );
  await assert.rejects(
    extractWithOpenAI({
      ...input,
      transport: async () => {
        throw new Error("SECRET-network-detail");
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof ExtractionError);
      assert.match(error.message, /No AI result was produced/);
      assert.doesNotMatch(error.message, /SECRET/);
      return true;
    },
  );
});

test("unconfigured AI rejects explicitly and never calls a transport", async () => {
  await assert.rejects(
    extractWithOpenAI({
      ...input,
      apiKey: "",
      transport: async () => {
        assert.fail("No model call expected");
      },
    }),
    (error: unknown) =>
      error instanceof ExtractionError && error.status === 409,
  );
});

test("extraction endpoint distinguishes local and model paths and makes no store changes (mock transport)", async (t) => {
  const store = new MessageStore();
  let calls = 0;
  const app = createApp({
    config: { ...loadConfig({}), apiKey: input.apiKey, model: input.model },
    store,
    aiTransport: async () => {
      calls++;
      return Response.json(envelope());
    },
  });
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const post = async (useAI: boolean) =>
    fetch(`http://127.0.0.1:${address.port}/api/orders/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: input.body, orders: seed.orders, useAI }),
    });
  const local = await (await post(false)).json();
  assert.equal(local.method, "local");
  assert.equal(local.evidence, undefined);
  assert.equal(calls, 0);
  const model = await (await post(true)).json();
  assert.equal(model.method, "ai");
  assert.equal(model.evidence.responseId, "resp_unit_test_only");
  assert.equal(calls, 1);
  assert.deepEqual(store.data, {
    proposals: [],
    inbox: [],
    seen: [],
    optedOut: false,
  });
});
