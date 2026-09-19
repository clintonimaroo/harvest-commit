import { createApp } from "../server/app.ts";
import { RedisStore } from "../server/store.ts";
import { waitUntil } from "@vercel/functions";

const store = new RedisStore(
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "",
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "",
);
export default createApp({ store, hosted: true, background: waitUntil });
