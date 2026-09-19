import type { FarmState } from "./planning.ts";
export type FarmSnapshot = {
  workspace: string;
  version: string;
  state: FarmState;
};
export type SaveFarm = {
  workspace: string;
  baseVersion: string;
  mutationId: string;
  state: FarmState;
};
export function createFarmSync(options: {
  initial: FarmSnapshot;
  push: (save: SaveFarm, signal: AbortSignal) => Promise<FarmSnapshot>;
  onStatus: (status: string) => void;
  retryMs?: number;
}) {
  let saved = JSON.stringify(options.initial.state);
  let latest = saved;
  let version = options.initial.version;
  let running = false;
  let stopped = false;
  let conflict = false;
  let active: SaveFarm | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abort = new AbortController();
  async function flush() {
    if (running || stopped || conflict || (!active && latest === saved)) return;
    running = true;
    options.onStatus("Saving changes…");
    active ||= {
      workspace: options.initial.workspace,
      baseVersion: version,
      mutationId: crypto.randomUUID(),
      state: JSON.parse(latest),
    };
    try {
      const result = await options.push(active, abort.signal);
      if (stopped) return;
      version = result.version;
      saved = JSON.stringify(active.state);
      active = undefined;
      options.onStatus(latest === saved ? "Saved online" : "Saving changes…");
    } catch (error) {
      if (stopped) return;
      conflict = !!(
        error &&
        typeof error === "object" &&
        "status" in error &&
        error.status === 409
      );
      options.onStatus(
        conflict
          ? "Changed on another device. Reload to sync; your draft is kept here."
          : "Saved on this device · waiting to sync",
      );
      if (!conflict)
        timer = setTimeout(() => void flush(), options.retryMs ?? 5000);
    } finally {
      running = false;
      if (!stopped && !conflict && !active && latest !== saved) void flush();
    }
  }
  return {
    update(state: FarmState) {
      latest = JSON.stringify(state);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), 250);
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      abort.abort();
    },
  };
}
