import { devDefaultAppUrl, devDefaultInternalSharedSecret } from "./common";

export function getInternalSharedSecret(env: any) {
  if (env.NODE_ENV === "development") {
    return env.INTERNAL_SHARED_SECRET ?? devDefaultInternalSharedSecret;
  }
  if (!env.INTERNAL_SHARED_SECRET) {
    throw new Error("INTERNAL_SHARED_SECRET is not set");
  }
  return env.INTERNAL_SHARED_SECRET;
}

export function getPublicAppUrl(env: any) {
  if (env.NODE_ENV === "development") {
    return env.BETTER_AUTH_URL ?? devDefaultAppUrl;
  }
  if (!env.BETTER_AUTH_URL) {
    throw new Error("BETTER_AUTH_URL is not set");
  }
  return env.BETTER_AUTH_URL;
}
