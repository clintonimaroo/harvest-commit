import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import express from "express";
import type { Express, Request } from "express";
import { RedisStore } from "./store.ts";
import type { Store } from "./store.ts";

const equal = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
export function installAuth(
  app: Express,
  token: string,
  publicUrl: string,
  hosted: boolean,
  store: Store,
) {
  const trustedOrigin = (req: Request) =>
    !req.get("Origin") ||
    req.get("Origin") === publicUrl ||
    (!hosted &&
      /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(req.get("Origin") || ""));
  const local = (req: Request) =>
    !hosted &&
    /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.get("Host") || "") &&
    ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
      req.socket.remoteAddress || "",
    ) &&
    !req.get("X-Forwarded-For") &&
    !req.get("Forwarded") &&
    !req.get("X-Forwarded-Host");
  const sign = (value: string) =>
    createHmac("sha256", token)
      .update(`harvest-session:${value}`)
      .digest("base64url");
  const authorized = (req: Request) => {
    if (local(req)) return true;
    if (token.length < 32) return false;
    if (equal(req.get("Authorization")?.replace(/^Bearer /, "") || "", token))
      return true;
    const cookie =
      req
        .get("Cookie")
        ?.split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("harvest-session="))
        ?.slice(16) || "";
    const [expires, signature] = cookie.split(".");
    return (
      !!expires &&
      /^\d+$/.test(expires) &&
      Number(expires) > Date.now() &&
      Number(expires) < Date.now() + 9 * 3600000 &&
      equal(signature || "", sign(expires))
    );
  };
  const attempts = new Map<string, { count: number; expires: number }>();
  app.use("/auth", express.json({ limit: "2kb" }), (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!trustedOrigin(req)) {
      res.status(403).json({ error: "Untrusted request origin." });
      return;
    }
    next();
  });
  app.get("/auth/session", (req, res) =>
    res.json({ authenticated: authorized(req), hosted }),
  );
  app.post("/auth/login", async (req, res) => {
    const ip =
      req.get("X-Vercel-Forwarded-For") ||
      req.socket.remoteAddress ||
      "unknown";
    const key = createHash("sha256").update(ip).digest("hex").slice(0, 24);
    let count: number;
    if (store instanceof RedisStore) {
      count = await store.command<number>(
        "EVAL",
        "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],900) end; return n",
        1,
        `harvest:login:${key}`,
      );
    } else {
      const previous = attempts.get(key);
      const current =
        previous && previous.expires > Date.now()
          ? previous
          : { count: 0, expires: Date.now() + 900000 };
      count = ++current.count;
      attempts.set(key, current);
    }
    if (count > 15) {
      res
        .status(429)
        .json({ error: "Too many attempts. Try again in 15 minutes." });
      return;
    }
    if (
      typeof req.body?.key !== "string" ||
      token.length < 32 ||
      !equal(req.body.key, token)
    ) {
      res
        .status(401)
        .json({ error: "That workspace access key is not correct." });
      return;
    }
    const expires = String(Date.now() + 8 * 3600000);
    res.cookie("harvest-session", `${expires}.${sign(expires)}`, {
      httpOnly: true,
      secure: hosted,
      sameSite: "strict",
      path: "/",
      maxAge: 8 * 3600000,
    });
    res.json({ ok: true });
  });
  app.post("/auth/logout", (_req, res) => {
    res.clearCookie("harvest-session", {
      httpOnly: true,
      secure: hosted,
      sameSite: "strict",
      path: "/",
    });
    res.json({ ok: true });
  });
  return { authorized, trustedOrigin };
}
