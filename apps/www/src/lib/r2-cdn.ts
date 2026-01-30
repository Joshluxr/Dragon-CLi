import { R2Client } from "@terragon/r2";
import { env } from "@terragon/env/apps-www";

// CDN-specific R2 client
export const r2Cdn = new R2Client({
  accessKeyId: env.R2_ACCESS_KEY_ID,
  secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  accountId: env.R2_ACCOUNT_ID,
  bucketName: "cdn-terragon",
  publicUrl: "https://cdn.terragonlabs.com",
});
