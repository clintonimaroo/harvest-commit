import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { MessagingStatus } from "./messages";
import { createMessagingSync } from "./messaging-sync";

export function useMessaging(workspace: string) {
  const [messaging, setMessaging] = useState<MessagingStatus | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const sync = useRef<ReturnType<
    typeof createMessagingSync<MessagingStatus>
  > | null>(null);
  useEffect(() => {
    const current = createMessagingSync<MessagingStatus>({
      fetchSnapshot: (after, signal) => {
        if (!navigator.onLine)
          return Promise.reject(
            new Error("Offline. Reconnect to receive new messages."),
          );
        return api<MessagingStatus>(
          `/api/messaging?workspace=${workspace}${after ? `&after=${encodeURIComponent(after)}` : ""}`,
          undefined,
          { signal },
        );
      },
      onData: (data) => {
        setMessaging(data);
        setConnectionError("");
      },
      onError: (error) => setConnectionError(error.message),
    });
    sync.current = current;
    current.start();
    const refresh = () => {
      void current.refresh();
    };
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      current.stop();
      if (sync.current === current) sync.current = null;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [workspace]);
  const refreshMessaging = useCallback(
    () => sync.current?.refresh() || Promise.resolve(),
    [],
  );
  return { messaging, connectionError, refreshMessaging };
}
