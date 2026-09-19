// One authenticated long-poll at a time. A saved server change completes the
// request immediately; an unchanged inbox returns a heartbeat after 25 seconds.
export function createMessagingSync<T extends { syncRevision: string }>({
  fetchSnapshot,
  onData,
  onError,
  retryMs = 1500,
}: {
  fetchSnapshot: (after: string | undefined, signal: AbortSignal) => Promise<T>;
  onData: (snapshot: T) => void;
  onError: (error: Error) => void;
  retryMs?: number;
}) {
  let running = false;
  let revision: string | undefined;
  let controller: AbortController | undefined;
  let waiters: (() => void)[] = [];
  const settle = () => {
    const pending = waiters;
    waiters = [];
    pending.forEach((resolve) => resolve());
  };
  const run = async () => {
    while (running) {
      const request = new AbortController();
      controller = request;
      try {
        const snapshot = await fetchSnapshot(revision, request.signal);
        // An aborted older response must never overwrite a newer refresh.
        if (!running) break;
        if (request.signal.aborted) continue;
        if (!snapshot.syncRevision)
          throw new Error(
            "Restart Harvest Commit to enable live inbox updates.",
          );
        revision = snapshot.syncRevision;
        onData(snapshot);
        settle();
      } catch (error) {
        if (!running) break;
        if (request.signal.aborted) continue;
        onError(
          error instanceof Error
            ? error
            : new Error("The inbox could not reconnect."),
        );
        settle();
        revision = undefined;
        await new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timer);
            request.signal.removeEventListener("abort", finish);
            resolve();
          };
          const timer = setTimeout(finish, retryMs);
          request.signal.addEventListener("abort", finish, { once: true });
        });
      }
    }
  };
  return {
    start() {
      if (running) return;
      running = true;
      void run();
    },
    refresh(): Promise<void> {
      if (!running) return Promise.resolve();
      revision = undefined;
      const next = new Promise<void>((resolve) => waiters.push(resolve));
      controller?.abort();
      return next;
    },
    stop() {
      running = false;
      controller?.abort();
      settle();
    },
  };
}
