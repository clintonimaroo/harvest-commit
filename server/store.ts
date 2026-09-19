import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { FarmState } from "../src/lib/planning.ts";
import type { InboxMessage, SmsProposal } from "../src/lib/messages.ts";

export type StoredProposal = SmsProposal & { requestKey: string; sid?: string };
export type FarmSnapshot = {
  workspace: string;
  version: string;
  state: FarmState;
  mutationId?: string;
};
export type Data = {
  proposals: StoredProposal[];
  inbox: InboxMessage[];
  seen: string[];
  optedOut: boolean;
  farm?: FarmSnapshot;
};
export type Snapshot = { revision: string; data: Data };
export const emptyData = (): Data => ({
  proposals: [],
  inbox: [],
  seen: [],
  optedOut: false,
});
export interface Store {
  read(): Promise<Snapshot>;
  change<T>(update: (data: Data) => T): Promise<T>;
  wait(revision: string, signal: AbortSignal): Promise<void>;
  notifyChange(): void;
}

export class MessageStore implements Store {
  data: Data;
  path?: string;
  revision = randomBytes(12).toString("hex");
  private listeners = new Set<() => void>();
  constructor(path?: string) {
    this.path = path;
    this.data =
      path && existsSync(path)
        ? JSON.parse(readFileSync(path, "utf8"))
        : emptyData();
    for (const p of this.data.proposals) {
      if (p.delivery === "sending") {
        p.delivery = "unknown";
        p.error = "Send interrupted. Check Twilio logs before trying again.";
      }
    }
  }
  save() {
    if (this.path) {
      mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
      writeFileSync(`${this.path}.tmp`, JSON.stringify(this.data), {
        mode: 0o600,
      });
      renameSync(`${this.path}.tmp`, this.path);
    }
    this.notifyChange();
  }
  notifyChange() {
    this.revision = randomBytes(12).toString("hex");
    for (const listener of [...this.listeners]) listener();
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  async read(): Promise<Snapshot> {
    return structuredClone({ revision: this.revision, data: this.data });
  }
  async change<T>(update: (data: Data) => T): Promise<T> {
    // The callback is synchronous: no external side effects can be retried.
    const next = structuredClone(this.data);
    const result = update(next);
    if (JSON.stringify(next) !== JSON.stringify(this.data)) {
      this.data = next;
      this.save();
    }
    return structuredClone(result);
  }
  async wait(revision: string, signal: AbortSignal): Promise<void> {
    if (signal.aborted || revision !== this.revision) return;
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        unsubscribe();
        signal.removeEventListener("abort", finish);
        resolve();
      };
      const unsubscribe = this.subscribe(finish);
      const timer = setTimeout(finish, 25000);
      signal.addEventListener("abort", finish, { once: true });
      if (signal.aborted || revision !== this.revision) finish();
    });
  }
}

// One atomic document is sufficient for this single-farm prototype. Compare-and-set
// protects simultaneous webhooks, approvals, and browser saves across Vercel instances.
export class RedisStore implements Store {
  private url: string;
  private token: string;
  private key: string;
  constructor(url: string, token: string, key = "harvest:production:v1") {
    if (!url.startsWith("https://") || !token)
      throw new Error("Hosted storage is not configured.");
    this.url = url.replace(/\/$/, "");
    this.token = token;
    this.key = key;
  }
  async command<T>(...command: (string | number)[]): Promise<T> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error("Hosted storage is temporarily unavailable.");
    const data = (await response.json()) as { result: T; error?: string };
    if (data.error)
      throw new Error("Hosted storage could not complete the request.");
    return data.result;
  }
  private async raw() {
    return (await this.command<string | null>("GET", this.key)) || "";
  }
  private decode(raw: string): Snapshot {
    return raw ? JSON.parse(raw) : { revision: "empty", data: emptyData() };
  }
  async read(): Promise<Snapshot> {
    return this.decode(await this.raw());
  }
  async change<T>(update: (data: Data) => T): Promise<T> {
    for (let attempt = 0; attempt < 12; attempt++) {
      const before = await this.raw();
      const snapshot = this.decode(before);
      const original = JSON.stringify(snapshot.data);
      const result = update(snapshot.data);
      if (JSON.stringify(snapshot.data) === original) return result;
      snapshot.revision = randomBytes(12).toString("hex");
      const applied = await this.command<number>(
        "EVAL",
        "local old=redis.call('GET',KEYS[1]) or ''; if old~=ARGV[1] then return 0 end; redis.call('SET',KEYS[1],ARGV[2]); return 1",
        1,
        this.key,
        before,
        JSON.stringify(snapshot),
      );
      if (applied === 1) return result;
      await new Promise((resolve) =>
        setTimeout(resolve, 15 + Math.random() * 40),
      );
    }
    throw new Error("The workspace is busy. Please try again.");
  }
  notifyChange() {
    /* Revision lives in Redis; process restarts cannot lose it. */
  }
  async wait(revision: string, signal: AbortSignal): Promise<void> {
    const until = Date.now() + 23000;
    while (!signal.aborted && Date.now() < until) {
      if ((await this.read()).revision !== revision) return;
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", finish);
          resolve();
        };
        const timer = setTimeout(finish, 1000);
        signal.addEventListener("abort", finish, { once: true });
        if (signal.aborted) finish();
      });
    }
  }
}
