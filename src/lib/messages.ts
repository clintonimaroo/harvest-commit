import type { FarmState, Order } from "./planning.ts";
import { formatHour, makePlan } from "./planning.ts";

export type InboxMessage = {
  id: string;
  from: string;
  body: string;
  receivedAt: string;
  source: "sample" | "pasted" | "sms";
};
export type ExtractionEvidence = {
  provider: "openai";
  model: string;
  responseId: string;
  requestId?: string;
  extractedAt: string;
  latencyMs: number;
  usage?: { inputTokens: number; outputTokens: number };
};
export type ExtractedOrder = {
  customer: string | null;
  boxes: number | null;
  crop: string | null;
  delivery: string | null;
  intent: "new" | "amend" | "cancel" | "unclear";
  warnings: string[];
} & (
  | { method: "local"; evidence?: never }
  | { method: "ai"; evidence: ExtractionEvidence }
);
export type SmsProposal = {
  id: string;
  workspace: string;
  revision: string;
  code: string;
  mode: "demo" | "live";
  body: string;
  target: number;
  capacity: number;
  recipient: string;
  phase: "pending" | "approved" | "changes_requested" | "superseded";
  delivery: string;
  createdAt: string;
  approvedAt?: string;
  requestedTarget?: number;
  reply?: string;
  error?: string;
};
export type MessagingStatus = {
  syncRevision: string;
  ready: boolean;
  campaignStatus?: string;
  campaignMessage?: string;
  missing: string[];
  farmer: string;
  sender: string;
  publicUrl: string;
  aiReady: boolean;
  optedOut: boolean;
  inbox: InboxMessage[];
  proposals: SmsProposal[];
};

export const sampleMessages: InboxMessage[] = [
  {
    id: "sample-message-amend",
    from: "Riverbend Kitchen",
    source: "sample",
    receivedAt: "2026-09-19T09:52:00Z",
    body: "Riverbend Kitchen: please change our order to 36 boxes of tomatoes for today, instead of 32. Same delivery time. Thanks, Sam.",
  },
  {
    id: "sample-message-new",
    from: "Corner Cafe",
    source: "sample",
    receivedAt: "2026-09-19T09:55:00Z",
    body: "Corner Cafe: can we have 12 boxes of tomatoes for today? Please confirm before we open.",
  },
];

// Deliberately conservative fallback. It never approves an order or infers yield.
export function extractLocally(body: string, orders: Order[]): ExtractedOrder {
  const known = orders
    .filter((o) => body.toLowerCase().includes(o.customer.toLowerCase()))
    .sort((a, b) => b.customer.length - a.customer.length)[0];
  const prefix = body.match(/^([^:\n]{2,80}):/);
  const customer = known?.customer || prefix?.[1]?.trim() || null;
  const quantities = [...body.matchAll(/\b(\d+)\s*boxes?\b/gi)].map((m) =>
    Number(m[1]),
  );
  const amendment = body.match(
    /(?:change\s+(?:our\s+)?(?:order\s+)?to|make\s+that|actually(?:,?\s+we\s+need)?|increase\s+(?:it\s+)?to|reduce\s+(?:it\s+)?to)\s*(\d+)\s*boxes?\b/i,
  );
  const cancelled = /\b(cancel|cancelled|canceled)\b/i.test(body);
  const boxes = cancelled
    ? 0
    : amendment
      ? Number(amendment[1])
      : quantities.length === 1
        ? quantities[0]
        : null;
  const crop = /\btomato(?:es)?\b/i.test(body) ? "Tomatoes" : null;
  const delivery =
    body.match(
      /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2})\b/i,
    )?.[0] || null;
  const warnings: string[] = [];
  if (!customer)
    warnings.push("The customer is missing. Confirm who placed this order.");
  if (boxes === null)
    warnings.push("A single confirmed box quantity could not be determined.");
  if (/\b(crates?|kg|kilos?|pounds?|lbs?)\b/i.test(body))
    warnings.push(
      "Check the unit and pack size. Crates or weights are not automatically converted to boxes.",
    );
  if (!crop) warnings.push("Confirm this is an order for tomatoes.");
  if (!delivery || !/^(today|saturday|2026-09-19)$/i.test(delivery))
    warnings.push("Confirm this order belongs to the September 19 demo plan.");
  if (/\b(not|don.t|no longer|unless|maybe|might)\b/i.test(body))
    warnings.push(
      "This message contains a condition or negation. Read the original before applying it.",
    );
  if (known)
    warnings.push(
      `There is already an order for ${known.customer}: ${known.boxes} boxes. Review whether this replaces it.`,
    );
  return {
    customer,
    boxes,
    crop,
    delivery,
    intent: cancelled
      ? "cancel"
      : amendment || /\binstead\b/i.test(body)
        ? "amend"
        : boxes !== null
          ? "new"
          : "unclear",
    warnings,
    method: "local",
  };
}

export function smsBody(state: FarmState, code: string) {
  const p = makePlan(state);
  const downside = Math.max(
    0,
    p.demand - state.packed - Math.min(p.low, p.target),
  );
  return `Harvest Commit | SAMPLE FARM\nPlan ${code}: ${p.target} tomato boxes. ${p.allocations.find((f) => f.boxes > 0)?.name || "Packed stock"} first.\n${p.demand} ordered - ${state.packed} packed = ${p.needed} needed.\nCutoff ${formatHour(state.rainHour)}. Finish ${formatHour(p.finish)}.\n${p.shortfall ? `${p.shortfall} boxes unfilled. ` : ""}${downside ? `Low-yield risk: ${downside} boxes short.` : "Covered at the low field estimate."}\nReply APPROVE ${code} or EDIT ${code} 100 to request 100 boxes.\nReply STOP to opt out.`;
}
