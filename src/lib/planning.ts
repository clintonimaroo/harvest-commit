import type { ExtractionEvidence, InboxMessage } from "./messages.ts";
export type Source =
  "Text message" | "Spreadsheet" | "Phone call" | "Manual entry";
export type Order = {
  id: string;
  customer: string;
  boxes: number;
  source: Source;
  time: string;
  provenance?: {
    messageId: string;
    body: string;
    from: string;
    receivedAt: string;
    reviewedAt: string;
    extraction: "local" | "ai";
    evidence?: ExtractionEvidence;
  };
};
export type Field = {
  id: string;
  name: string;
  area: string;
  estimate: number;
  low: number;
  high: number;
  note: string;
  checked: string;
};
export type HarvestRecord = {
  id: string;
  date: string;
  planned: number;
  actual: number | null;
  demand: number;
  packed: number;
  note: string;
};
export type FarmState = {
  version: 1;
  revision?: string;
  reviewedMessages?: string[];
  deletedMessages?: string[];
  pastedMessages?: InboxMessage[];
  orders: Order[];
  fields: Field[];
  packed: number;
  crew: number;
  startHour: number;
  rainHour: number;
  target: number | null;
  planNote: string;
  approvedAt: string | null;
  approvedVia?: string;
  records: HarvestRecord[];
};

export const seed: FarmState = {
  version: 1,
  orders: [
    {
      id: "ord-1",
      customer: "Riverbend Kitchen",
      boxes: 32,
      source: "Text message",
      time: "5:42 AM",
    },
    {
      id: "ord-2",
      customer: "The Saturday Market",
      boxes: 28,
      source: "Spreadsheet",
      time: "Yesterday",
    },
    {
      id: "ord-3",
      customer: "Willow & Rye",
      boxes: 24,
      source: "Phone call",
      time: "Yesterday",
    },
    {
      id: "ord-4",
      customer: "Township Grocer",
      boxes: 18,
      source: "Spreadsheet",
      time: "Yesterday",
    },
    {
      id: "ord-5",
      customer: "Little Acre CSA",
      boxes: 14,
      source: "Spreadsheet",
      time: "Yesterday",
    },
    {
      id: "ord-6",
      customer: "Miller Family",
      boxes: 10,
      source: "Text message",
      time: "5:51 AM",
    },
  ],
  fields: [
    {
      id: "B",
      name: "Field B",
      area: "Lower pasture · 1.8 acres",
      estimate: 78,
      low: 70,
      high: 85,
      note: "Good color across the lower rows. Ground is dry enough for the crew. Pick this field before the rain.",
      checked: "5:40 AM",
    },
    {
      id: "A",
      name: "Field A",
      area: "North rows · 1.2 acres",
      estimate: 39,
      low: 34,
      high: 43,
      note: "Steady picking in rows 1–6. Leave the upper rows for the next walk-through.",
      checked: "5:25 AM",
    },
  ],
  packed: 18,
  crew: 6,
  startHour: 6.5,
  rainHour: 14,
  target: null,
  planNote: "",
  approvedAt: null,
  records: [
    {
      id: "sample-18",
      date: "2026-09-18",
      planned: 96,
      actual: 94,
      demand: 110,
      packed: 14,
      note: "Finished at 12:20 PM. Two boxes below plan.",
    },
    {
      id: "sample-17",
      date: "2026-09-17",
      planned: 104,
      actual: 104,
      demand: 120,
      packed: 16,
      note: "All orders covered.",
    },
    {
      id: "sample-16",
      date: "2026-09-16",
      planned: 88,
      actual: 90,
      demand: 100,
      packed: 12,
      note: "Two extra boxes moved into packed stock.",
    },
  ],
};

export const BOXES_PER_PERSON_HOUR = 3;
export const PACKING_HOURS = 0.75;

export function makePlan(state: FarmState) {
  const demand = state.orders.reduce((sum, order) => sum + order.boxes, 0);
  const needed = Math.max(0, demand - state.packed);
  const estimate = state.fields.reduce((sum, field) => sum + field.estimate, 0);
  const low = state.fields.reduce((sum, field) => sum + field.low, 0);
  const high = state.fields.reduce((sum, field) => sum + field.high, 0);
  const hours = Math.max(0, state.rainHour - state.startHour - PACKING_HOURS);
  const laborCapacity = Math.floor(hours * state.crew * BOXES_PER_PERSON_HOUR);
  const capacity = Math.min(estimate, laborCapacity);
  const requested = state.target ?? needed;
  const target = Math.max(0, Math.min(requested, capacity));
  const shortfall = Math.max(0, demand - state.packed - target);
  const surplus = Math.max(0, state.packed + target - demand);
  const pickHours =
    target > 0 && state.crew > 0
      ? target / (state.crew * BOXES_PER_PERSON_HOUR)
      : 0;
  const finish = state.startHour + pickHours + (target > 0 ? PACKING_HOURS : 0);
  let remaining = target;
  let nextStart = state.startHour;
  const allocations = state.fields.map((field, index) => {
    // Allocate proportionally to usable yield, then put any rounding remainder in the final field.
    const boxes = Math.min(
      field.estimate,
      index === state.fields.length - 1
        ? remaining
        : Math.round((target * field.estimate) / (estimate || 1)),
    );
    remaining -= boxes;
    const start = nextStart;
    nextStart += boxes / (state.crew * BOXES_PER_PERSON_HOUR);
    return { ...field, boxes, crew: state.crew, start, finish: nextStart };
  });
  return {
    demand,
    needed,
    estimate,
    low,
    high,
    laborCapacity,
    capacity,
    requested,
    target,
    shortfall,
    surplus,
    pickHours,
    finish,
    allocations,
    atRisk: target > low,
    conservativeShortfall: Math.max(
      0,
      demand - state.packed - Math.min(low, target),
    ),
    constrained: target < requested,
  };
}

export function formatHour(hour: number) {
  const minutes = Math.round(hour * 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function crewSheet(state: FarmState) {
  const plan = makePlan(state);
  return `HARVEST COMMIT\nPine Hollow Farm | Saturday, September 19, 2026\n${state.approvedAt ? "APPROVED PLAN" : "DRAFT PLAN"}${state.approvedVia ? ` | ${state.approvedVia}` : ""}\n\nHarvest ${plan.target} boxes of tomatoes.\n${plan.allocations.map((f) => `${f.name}: ${f.boxes} boxes. Same ${f.crew}-person crew, ${formatHour(f.start)} to ${formatHour(f.finish)}.`).join("\n")}\nStart ${formatHour(state.startHour)}. Estimated finish, including packing: ${formatHour(plan.finish)}.\nFarmer-set harvest cutoff: ${formatHour(state.rainHour)}.\n\n${plan.demand} boxes ordered. ${state.packed} already packed.\n${plan.shortfall ? `${plan.shortfall}-box shortfall: follow up with customers.` : "Orders covered at expected yield."}\n${plan.conservativeShortfall ? `Low-yield scenario: ${plan.conservativeShortfall} boxes short.\n` : ""}${plan.surplus ? `${plan.surplus} boxes above current orders.\n` : ""}Usable yield estimate: ${plan.low}–${plan.high} boxes. Verify in the field.\n${state.planNote ? `\nFarmer's note: ${state.planNote}\n` : ""}\nSample farm data. Saved on this device. Copying or downloading this sheet does not send a message.`;
}

export function parseOrderMessage(message: string) {
  const quantity = message.match(/\b(\d+)\s*(?:boxes?|crates?)\b/i);
  const customer = message.split(":")[0]?.trim();
  if (
    !quantity ||
    !customer ||
    !message.includes(":") ||
    customer.length > 80 ||
    Number(quantity[1]) < 1
  )
    return null;
  return { customer, boxes: Number(quantity[1]) };
}

export function readSavedState(raw: string | null): FarmState {
  if (!raw) return structuredClone(seed);
  try {
    const value = JSON.parse(raw) as FarmState;
    const nonnegative = (n: unknown) =>
      typeof n === "number" && Number.isFinite(n) && n >= 0;
    if (
      value.version !== 1 ||
      !Array.isArray(value.orders) ||
      !Array.isArray(value.fields) ||
      value.fields.length !== 2 ||
      !Array.isArray(value.records)
    )
      throw new Error("Invalid saved data");
    if (
      !value.orders.every(
        (o) =>
          typeof o.id === "string" &&
          typeof o.customer === "string" &&
          nonnegative(o.boxes) &&
          typeof o.source === "string",
      )
    )
      throw new Error("Invalid orders");
    if (
      !value.fields.every(
        (f) =>
          typeof f.id === "string" &&
          typeof f.name === "string" &&
          nonnegative(f.estimate) &&
          nonnegative(f.low) &&
          nonnegative(f.high) &&
          f.low <= f.estimate &&
          f.high >= f.estimate,
      )
    )
      throw new Error("Invalid fields");
    if (
      ![value.packed, value.startHour, value.rainHour].every(nonnegative) ||
      !nonnegative(value.crew) ||
      value.crew < 1 ||
      value.crew > 15 ||
      value.rainHour > 24 ||
      value.startHour >= value.rainHour ||
      (value.target !== null && !nonnegative(value.target))
    )
      throw new Error("Invalid settings");
    return value;
  } catch {
    return structuredClone(seed);
  }
}
