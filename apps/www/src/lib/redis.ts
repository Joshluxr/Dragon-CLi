import { env } from "@terragon/env/apps-www";
import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: env.REDIS_URL,
  token: env.REDIS_TOKEN,
});
