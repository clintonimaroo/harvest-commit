import express from "express";
import { extractWithOpenAI, ExtractionError } from "./extraction.ts";
import type { Request, Response, NextFunction } from "express";
import twilio from "twilio";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { MessageStore } from "./store.ts";
import type { Data, Store, StoredProposal } from "./store.ts";
import { installAuth } from "./auth.ts";
export { MessageStore } from "./store.ts";
import { resolve } from "node:path";
import type { FarmState } from "../src/lib/planning.ts";
import { makePlan } from "../src/lib/planning.ts";
import { extractLocally, smsBody } from "../src/lib/messages.ts";
import type { SmsProposal } from "../src/lib/messages.ts";

export type Config = {
  account: string;
  token: string;
  from: string;
  service: string;
  campaign: string;
  farmer: string;
  publicUrl: string;
  enabled: boolean;
  adminToken: string;
  apiKey: string;
  model: string;
};
export function loadConfig(env = process.env): Config {
  return {
    account: env.TWILIO_ACCOUNT_SID || "",
    token: env.TWILIO_AUTH_TOKEN || "",
    from: env.TWILIO_PHONE_NUMBER || "",
    service: env.TWILIO_MESSAGING_SERVICE_SID || "",
    campaign: env.TWILIO_A2P_CAMPAIGN_SID || "",
    farmer: env.FARMER_PHONE_NUMBER || "",
    publicUrl: (env.PUBLIC_BASE_URL || "").replace(/\/$/, ""),
    enabled: env.SMS_ENABLED === "true",
    adminToken: env.HARVEST_ADMIN_TOKEN || "",
    apiKey: env.OPENAI_API_KEY || "",
    model: env.OPENAI_MODEL || "",
  };
}
const phone = /^\+[1-9]\d{7,14}$/;
function missingConfig(c: Config) {
  return [
    !c.enabled && "SMS_ENABLED=true",
    !/^AC[\da-f]{32}$/i.test(c.account) && "TWILIO_ACCOUNT_SID",
    !c.token && "TWILIO_AUTH_TOKEN",
    !(phone.test(c.from) || /^MG[\da-f]{32}$/i.test(c.service)) &&
      "TWILIO_PHONE_NUMBER or TWILIO_MESSAGING_SERVICE_SID",
    !/^MG[\da-f]{32}$/i.test(c.service) && "TWILIO_MESSAGING_SERVICE_SID",
    !/^QE[\da-f]{32}$/i.test(c.campaign) && "TWILIO_A2P_CAMPAIGN_SID",
    !phone.test(c.farmer) && "FARMER_PHONE_NUMBER",
    !/^https:\/\/[^/]+$/.test(c.publicUrl) && "PUBLIC_BASE_URL (HTTPS origin)",
  ].filter(Boolean) as string[];
}
class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const count = z.number().int().min(0).max(100000);
const farmSchema = z
  .object({
    orders: z
      .array(
        z
          .object({
            id: z.string(),
            customer: z.string().max(80),
            boxes: count,
          })
          .passthrough(),
      )
      .max(500),
    fields: z
      .array(
        z
          .object({
            id: z.string(),
            name: z.string().max(80),
            estimate: count,
            low: count,
            high: count,
          })
          .passthrough()
          .refine((f) => f.low <= f.estimate && f.estimate <= f.high),
      )
      .min(1)
      .max(20),
    packed: count,
    crew: z.number().int().min(1).max(15),
    startHour: z.number().min(0).max(24),
    rainHour: z.number().min(0).max(24),
    target: count.nullable(),
  })
  .passthrough()
  .refine((f) => f.rainHour > f.startHour + 0.75);
const sendSchema = z.object({
  workspace: z.string().uuid(),
  revision: z.string().min(1).max(100),
  requestKey: z.string().uuid(),
  mode: z.enum(["demo", "live"]),
  state: farmSchema,
});
type Send = (
  body: string,
  callback: string,
) => Promise<{ sid: string; status: string }>;
function publicProposal(p: StoredProposal): SmsProposal {
  const { requestKey: _key, sid: _sid, ...rest } = p;
  return rest;
}

export function createApp({
  config = loadConfig(),
  store = new MessageStore(resolve(".data/messaging.json")),
  send,
  checkCampaign,
  aiTransport,
  hosted = false,
  background = (promise: Promise<unknown>) => {
    void promise;
  },
}: {
  config?: Config;
  store?: Store;
  hosted?: boolean;
  background?: (promise: Promise<unknown>) => void;
  send?: Send;
  checkCampaign?: () => Promise<string>;
  aiTransport?: typeof fetch;
} = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "no-referrer");
    next();
  });
  const client = () =>
    twilio(config.account, config.token, { autoRetry: false, timeout: 15000 });
  let campaignCache: { status: string; checkedAt: number } | undefined;
  let campaignRequest: Promise<string> | undefined;
  async function readCampaign(fresh = false): Promise<string> {
    if (!config.account || !config.token || !config.service || !config.campaign)
      return "NOT_CONFIGURED";
    if (!fresh && campaignCache && Date.now() - campaignCache.checkedAt < 60000)
      return campaignCache.status;
    if (campaignRequest) return campaignRequest;
    campaignRequest = (async () => {
      let status: string;
      try {
        status = checkCampaign
          ? await checkCampaign()
          : (
              await client()
                .messaging.v1.services(config.service)
                .usAppToPerson(config.campaign)
                .fetch()
            ).campaignStatus;
      } catch {
        // Never turn an API failure into approval or expose provider credentials.
        status = "UNAVAILABLE";
      }
      const changed = status !== campaignCache?.status;
      campaignCache = { status, checkedAt: Date.now() };
      if (changed) store.notifyChange();
      return status;
    })();
    try {
      return await campaignRequest;
    } finally {
      campaignRequest = undefined;
    }
  }
  function campaignMessage(status: string): string {
    if (status === "CHECKING")
      return "Checking carrier approval. Sending stays paused until approval is confirmed.";
    if (status === "VERIFIED") return "Carrier campaign approved.";
    if (status === "IN_PROGRESS" || status === "PENDING")
      return "Your SMS campaign is submitted and awaiting carrier approval. Sending will become available after approval.";
    if (status === "FAILED")
      return "The SMS campaign needs changes in Twilio before sending can be enabled.";
    if (status === "NOT_CONFIGURED")
      return "Connect the Twilio Messaging Service and registered SMS campaign.";
    return "Carrier approval could not be confirmed. Sending is paused; the app will check again.";
  }
  const sendMessage: Send =
    send ||
    (async (body, callback) => {
      const result = await client().messages.create({
        to: config.farmer,
        body,
        statusCallback: callback,
        ...(config.service
          ? { messagingServiceSid: config.service }
          : { from: config.from }),
      });
      return { sid: result.sid, status: result.status };
    });

  function processReply(
    data: Data,
    body: string,
    mode: "demo" | "live",
    workspace?: string,
  ) {
    const match = body
      .trim()
      .match(/^(APPROVE|EDIT)\s+([A-F0-9]{6})(?:\s+(\d+))?$/i);
    if (!match)
      return "Use APPROVE followed by the six-character plan code, or EDIT code quantity. No plan was changed.";
    const p = data.proposals.find(
      (p) =>
        p.code === match[2].toUpperCase() &&
        p.mode === mode &&
        (!workspace || p.workspace === workspace),
    );
    if (
      !p ||
      p.phase === "superseded" ||
      Date.now() - Date.parse(p.createdAt) > 24 * 60 * 60 * 1000
    )
      return "That plan is no longer current. Please request the latest plan. Nothing was approved.";
    if (["failed", "undelivered"].includes(p.delivery))
      return "This plan could not be delivered. Request a new plan in Harvest Commit.";
    if (p.phase === "approved")
      return `Plan ${p.code} was already approved. No duplicate commitment was created.`;
    if (p.phase === "changes_requested")
      return "Your edit is waiting for review. Approve the new plan code after it is sent.";
    if (match[1].toUpperCase() === "EDIT") {
      const target = Number(match[3]);
      if (!match[3] || !Number.isInteger(target) || target > p.capacity)
        return `Use EDIT ${p.code} followed by a whole number from 0 to ${p.capacity}. Nothing changed.`;
      p.phase = "changes_requested";
      p.requestedTarget = target;
      p.reply = `Requested ${target} boxes. Awaiting a revised plan.`;
    } else {
      if (match[3])
        return "To change quantity, use EDIT code quantity. Nothing was approved.";
      p.phase = "approved";
      p.approvedAt = new Date().toISOString();
      p.reply = `Approved ${p.target} boxes by SMS.`;
    }
    return p.phase === "approved"
      ? `Plan ${p.code} approved: harvest ${p.target} tomato boxes. Your approval is recorded.`
      : `Requested ${p.requestedTarget} boxes. The farm will review and send a new plan for approval. Nothing is approved yet.`;
  }

  // Only Twilio-signed form requests can reach these public endpoints.
  app.use(
    "/webhooks/twilio",
    express.urlencoded({ extended: false, limit: "16kb" }),
  );
  app.use("/webhooks/twilio", (req, res, next) => {
    const valid =
      config.token &&
      config.publicUrl &&
      twilio.validateRequest(
        config.token,
        req.get("X-Twilio-Signature") || "",
        `${config.publicUrl}${req.originalUrl}`,
        req.body || {},
      );
    if (!valid || req.body.AccountSid !== config.account) {
      res.sendStatus(403);
      return;
    }
    next();
  });
  app.post("/webhooks/twilio/inbound", async (req, res) => {
    const { MessageSid, From, Body, OptOutType } = req.body;
    if (
      typeof MessageSid !== "string" ||
      !/^SM[\da-f]{32}$/i.test(MessageSid) ||
      typeof From !== "string" ||
      typeof Body !== "string"
    ) {
      res.sendStatus(400);
      return;
    }
    const reply = await store.change((data) => {
      if (data.seen.includes(MessageSid)) return null;
      data.seen.push(MessageSid);
      const control = Body.trim().toUpperCase();
      if (
        OptOutType ||
        /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|OPTOUT|REVOKE|START|UNSTOP|YES|HELP|INFO)$/.test(
          control,
        )
      ) {
        if (From === config.farmer) {
          if (
            OptOutType === "STOP" ||
            /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|OPTOUT|REVOKE)$/.test(
              control,
            )
          )
            data.optedOut = true;
          if (OptOutType === "START" || /^(START|UNSTOP|YES)$/.test(control))
            data.optedOut = false;
        }
      } else if (
        From === config.farmer &&
        /^(APPROVE|EDIT)\b/i.test(Body.trim())
      ) {
        return `Harvest Commit: ${processReply(data, Body, "live")}\nReply STOP to opt out.`;
      } else {
        data.inbox.unshift({
          id: MessageSid,
          from: From,
          body: Body.slice(0, 4000),
          receivedAt: new Date().toISOString(),
          source: "sms",
        });
      }
      return null;
    });
    const response = new twilio.twiml.MessagingResponse();
    if (reply) response.message(reply);
    res.type("text/xml").send(response.toString());
  });
  const deliveryRank: Record<string, number> = {
    sending: 0,
    accepted: 1,
    queued: 2,
    sent: 3,
    failed: 4,
    undelivered: 4,
    delivered: 5,
  };
  app.post("/webhooks/twilio/status", async (req, res) => {
    await store.change((data) => {
      const p = data.proposals.find(
        (p) =>
          p.sid === req.body.MessageSid ||
          (req.query.proposal === p.id && p.mode === "live"),
      );
      const status = String(req.body.MessageStatus || "");
      if (
        p &&
        status in deliveryRank &&
        deliveryRank[status] >= (deliveryRank[p.delivery] ?? 0)
      ) {
        p.sid = req.body.MessageSid;
        p.delivery = status;
        if (status === "failed" || status === "undelivered")
          p.error = `Twilio reports ${status}${req.body.ErrorCode ? ` (${String(req.body.ErrorCode).replace(/\D/g, "").slice(0, 8)})` : ""}. Check the Twilio messaging log.`;
      }
    });
    res.sendStatus(204);
  });

  const { authorized, trustedOrigin } = installAuth(
    app,
    config.adminToken,
    config.publicUrl,
    hosted,
    store,
  );
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!trustedOrigin(req)) {
      res.status(403).json({ error: "Untrusted request origin." });
      return;
    }
    if (!authorized(req)) {
      res
        .status(401)
        .json({ error: "Sign in to your Harvest Commit workspace." });
      return;
    }
    if (!["GET", "HEAD"].includes(req.method) && !req.is("application/json")) {
      res.status(415).json({ error: "JSON is required." });
      return;
    }
    next();
  });
  app.use("/api", express.json({ limit: "128kb" }));
  app.get("/api/messaging", async (req, res) => {
    const workspace = z.string().uuid().parse(req.query.workspace);
    const after = z.string().max(100).optional().parse(req.query.after);
    // Inbox reads never wait for a carrier-status API call. Sending still checks it afresh.
    background(readCampaign());
    let snapshot = await store.read();
    const statusBefore = campaignCache?.status || "CHECKING";
    if (after === `${snapshot.revision}:${statusBefore}`) {
      const abort = new AbortController();
      const close = () => abort.abort();
      res.on("close", close);
      try {
        await store.wait(snapshot.revision, abort.signal);
      } finally {
        res.off("close", close);
      }
      if (res.destroyed) return;
      snapshot = await store.read();
    }
    const campaignStatus =
      campaignCache?.status ||
      (!config.account || !config.token || !config.service || !config.campaign
        ? "NOT_CONFIGURED"
        : "CHECKING");
    res.json({
      syncRevision: `${snapshot.revision}:${campaignStatus}`,
      ready:
        missingConfig(config).length === 0 &&
        !snapshot.data.optedOut &&
        campaignStatus === "VERIFIED",
      campaignStatus,
      campaignMessage: campaignMessage(campaignStatus),
      missing: missingConfig(config),
      farmer: config.farmer,
      sender: config.from || (config.service ? "Messaging Service" : ""),
      publicUrl: config.publicUrl,
      aiReady: !!(config.apiKey && config.model),
      optedOut: snapshot.data.optedOut,
      inbox: snapshot.data.inbox,
      proposals: snapshot.data.proposals
        .filter((p) => p.workspace === workspace)
        .map(publicProposal),
    });
  });
  app.post("/api/sms/proposals", async (req, res) => {
    const input = sendSchema.parse(req.body);
    if (input.mode === "live") {
      const campaignStatus = await readCampaign(true);
      if (campaignStatus !== "VERIFIED")
        throw new ApiError(409, campaignMessage(campaignStatus));
    }
    const reserved = await store.change((data) => {
      const previous = data.proposals.find(
        (p) =>
          p.requestKey === input.requestKey && p.workspace === input.workspace,
      );
      if (previous) return { proposal: previous, created: false };
      if (
        input.mode === "live" &&
        (missingConfig(config).length || data.optedOut)
      )
        throw new ApiError(
          409,
          data.optedOut
            ? "The farmer opted out. They must text START to the Twilio number before sending again."
            : "Complete the Twilio settings before sending a real SMS.",
        );
      if (
        hosted &&
        data.farm &&
        (input.workspace !== data.farm.workspace ||
          input.revision !== data.farm.state.revision)
      )
        throw new ApiError(
          409,
          "Save the latest workspace changes before sending this plan.",
        );
      if (
        input.mode === "live" &&
        data.proposals.filter(
          (p) =>
            p.mode === "live" && Date.now() - Date.parse(p.createdAt) < 60000,
        ).length >= 3
      )
        throw new ApiError(
          429,
          "Three texts were requested in the last minute. Wait before sending another.",
        );
      const state = input.state as unknown as FarmState;
      const plan = makePlan(state);
      let code: string;
      do {
        code = randomBytes(3).toString("hex").toUpperCase();
      } while (data.proposals.some((p) => p.code === code));
      const p: StoredProposal = {
        id: crypto.randomUUID(),
        workspace: input.workspace,
        revision: input.revision,
        requestKey: input.requestKey,
        code,
        mode: input.mode,
        body: smsBody(state, code),
        target: plan.target,
        capacity: Math.min(plan.estimate, plan.laborCapacity),
        recipient: input.mode === "demo" ? "Demo phone" : config.farmer,
        phase: "pending",
        delivery: input.mode === "demo" ? "simulated" : "sending",
        createdAt: new Date().toISOString(),
      };
      for (const old of data.proposals)
        if (
          old.workspace === p.workspace &&
          old.mode === p.mode &&
          ["pending", "changes_requested"].includes(old.phase)
        )
          old.phase = "superseded";
      data.proposals.unshift(p);
      return { proposal: p, created: true };
    });
    if (!reserved.created) {
      res.json(publicProposal(reserved.proposal));
      return;
    }
    let p = reserved.proposal;
    if (p.mode === "live") {
      let result: { sid: string; status: string } | undefined;
      let failure: { delivery: string; error: string } | undefined;
      try {
        result = await sendMessage(
          p.body,
          `${config.publicUrl}/webhooks/twilio/status?proposal=${p.id}`,
        );
      } catch (error) {
        const status =
          typeof error === "object" && error && "status" in error
            ? Number(error.status)
            : 0;
        const delivery = status >= 400 && status < 500 ? "failed" : "unknown";
        failure = {
          delivery,
          error:
            delivery === "failed"
              ? "Twilio rejected this send. Check the Twilio messaging log."
              : "Delivery could not be confirmed. Check Twilio logs before trying again; this request will not be retried automatically.",
        };
      }
      p = await store.change((data) => {
        const current = data.proposals.find((item) => item.id === p.id)!;
        if (result) {
          current.sid = result.sid;
          if (
            (deliveryRank[result.status] ?? 0) >=
            (deliveryRank[current.delivery] ?? 0)
          )
            current.delivery = result.status;
        } else if (failure && current.delivery === "sending")
          Object.assign(current, failure);
        return current;
      });
    }
    res.status(201).json(publicProposal(p));
  });
  app.post("/api/sms/invalidate", async (req, res) => {
    const { workspace, revision } = z
      .object({
        workspace: z.string().uuid(),
        revision: z.string().min(1).max(100),
      })
      .parse(req.body);
    await store.change((data) => {
      if (hosted && data.farm && data.farm.state.revision !== revision) return;
      for (const p of data.proposals)
        if (
          p.workspace === workspace &&
          p.revision !== revision &&
          ["pending", "changes_requested"].includes(p.phase)
        )
          p.phase = "superseded";
    });
    res.json({ ok: true });
  });
  app.post("/api/sms/demo-reply", async (req, res) => {
    const { workspace, body } = z
      .object({
        workspace: z.string().uuid(),
        body: z.string().min(1).max(160),
      })
      .parse(req.body);
    res.json({
      reply: await store.change((data) =>
        processReply(data, body, "demo", workspace),
      ),
    });
  });
  app.get("/api/farm", async (_req, res) => {
    res.json((await store.read()).data.farm || null);
  });
  app.post("/api/farm", async (req, res) => {
    const input = z
      .object({
        workspace: z.string().uuid(),
        baseVersion: z.string().nullable(),
        mutationId: z.string().uuid(),
        state: farmSchema,
      })
      .parse(req.body);
    const snapshot = await store.change((data) => {
      if (data.farm?.mutationId === input.mutationId) return data.farm;
      if ((data.farm?.version || null) !== input.baseVersion)
        throw new ApiError(
          409,
          "This workspace changed on another device. Your draft is saved on this device; reload to use the latest shared plan.",
        );
      if (data.farm && data.farm.workspace !== input.workspace)
        throw new ApiError(409, "Use the existing farm workspace.");
      data.farm = {
        workspace: input.workspace,
        version: crypto.randomUUID(),
        state: input.state as unknown as FarmState,
        mutationId: input.mutationId,
      };
      for (const p of data.proposals)
        if (
          p.workspace === input.workspace &&
          p.revision !== input.state.revision &&
          ["pending", "changes_requested"].includes(p.phase)
        )
          p.phase = "superseded";
      return data.farm;
    });
    res.json(snapshot);
  });
  app.post("/api/orders/extract", async (req, res) => {
    const input = z
      .object({
        body: z.string().min(1).max(4000),
        orders: z
          .array(
            z.object({
              id: z.string(),
              customer: z.string().max(80),
              boxes: count,
            }),
          )
          .max(500),
        useAI: z.boolean().default(false),
      })
      .parse(req.body);
    if (!input.useAI) {
      res.json(extractLocally(input.body, input.orders as never));
      return;
    }
    res.json(
      await extractWithOpenAI({
        body: input.body,
        customers: input.orders.map((o) => o.customer),
        apiKey: config.apiKey,
        model: config.model,
        transport: aiTransport,
      }),
    );
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Unknown endpoint." }),
  );
  app.use(
    express.static(resolve("dist"), {
      index: "index.html",
      setHeaders: (res, path) => {
        if (/sw\.js$|index\.html$/.test(path))
          res.setHeader("Cache-Control", "no-cache");
      },
    }),
  );
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof z.ZodError) {
        res
          .status(400)
          .json({ error: "Check the submitted fields and planning values." });
        return;
      }
      if (error instanceof ApiError || error instanceof ExtractionError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      res.status(500).json({
        error:
          "The request could not be completed. Your local plan has not changed.",
      });
    },
  );
  return app;
}
