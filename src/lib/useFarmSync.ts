import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { createFarmSync } from "./farm-sync";
import type { FarmSnapshot } from "./farm-sync";
import type { FarmState } from "./planning";

export function useFarmSync(state: FarmState, initial?: FarmSnapshot) {
  const [status, setStatus] = useState(
    initial ? "Saved online" : "Saved on this device",
  );
  const sync = useRef<ReturnType<typeof createFarmSync> | null>(null);
  useEffect(() => {
    if (!initial) return;
    const writer = createFarmSync({
      initial,
      onStatus: setStatus,
      push: (save, signal) => api<FarmSnapshot>("/api/farm", save, { signal }),
    });
    sync.current = writer;
    return () => {
      writer.stop();
      if (sync.current === writer) sync.current = null;
    };
  }, [initial]);
  useEffect(() => {
    sync.current?.update(state);
  }, [state, initial]);
  return status;
}
