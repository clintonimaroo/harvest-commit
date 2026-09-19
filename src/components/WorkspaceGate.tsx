import { useEffect, useState } from "react";
import App from "../App";
import { api } from "../lib/api";
import { seed } from "../lib/planning";
import type { FarmSnapshot } from "../lib/farm-sync";
import { Sprout, ArrowRight } from "../icons";
import "../workspace.css";

export function WorkspaceGate() {
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [cloud, setCloud] = useState<FarmSnapshot>();
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function open() {
    const session = await api<{ authenticated: boolean; hosted: boolean }>(
      "/auth/session",
    );
    if (!session.authenticated) {
      setLocked(true);
      return;
    }
    if (session.hosted) {
      let farm = await api<FarmSnapshot | null>("/api/farm");
      if (!farm)
        farm = await api<FarmSnapshot>("/api/farm", {
          workspace: crypto.randomUUID(),
          baseVersion: null,
          mutationId: crypto.randomUUID(),
          state: { ...structuredClone(seed), revision: crypto.randomUUID() },
        });
      setCloud(farm);
    }
    setReady(true);
  }
  useEffect(() => {
    void open().catch((e: Error) => setError(e.message));
  }, []);
  if (ready)
    return (
      <App
        cloud={cloud}
        onSignOut={
          cloud
            ? async () => {
                await api("/auth/logout", {});
                sessionStorage.removeItem("harvest-access-token");
                setReady(false);
                setLocked(true);
                setCloud(undefined);
                setKey("");
              }
            : undefined
        }
      />
    );
  return (
    <main className="workspace-gate">
      <section className="workspace-entry">
        <span className="workspace-entry-mark">
          <Sprout size={28} />
        </span>
        <p className="workspace-entry-name">Harvest Commit</p>
        <h1>{locked ? "Welcome to the farm." : "Opening your workspace…"}</h1>
        <p>
          {locked
            ? "Sign in to Pine Hollow Farm to review orders and plan the harvest."
            : "Connecting to your saved plan."}
        </p>
        {locked && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await api("/auth/login", { key: key.trim() });
                setKey("");
                await open();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label htmlFor="workspace-key">Workspace access key</label>
            <input
              id="workspace-key"
              type="password"
              autoComplete="current-password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
              autoFocus
            />
            <button className="button primary" disabled={busy}>
              {busy ? "Signing in…" : "Open workspace"}
              <ArrowRight size={17} />
            </button>
          </form>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {!locked && error && (
          <button
            className="button secondary"
            onClick={() => {
              setError("");
              void open().catch((e: Error) => setError(e.message));
            }}
          >
            Try again
          </button>
        )}
      </section>
    </main>
  );
}
