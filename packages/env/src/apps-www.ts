import { envsafe, str, bool, num } from "envsafe";
import {
  devDefaultDatabaseUrl,
  devDefaultBetterAuthSecret,
  devDefaultCronSecret,
  devDefaultInternalSharedSecret,
  devDefaultIsAnthropicDownUrl,
  devDefaultIsAnthropicDownApiSecret,
  devDefaultBetterAuthUrl,
  devDefaultRedisUrl,
  devDefaultRedisToken,
} from "./common";

export const env = envsafe({
  DATABASE_URL: str({
    devDefault: devDefaultDatabaseUrl,
  }),
  REDIS_URL: str({
    devDefault: devDefaultRedisUrl,
  }),
  REDIS_TOKEN: str({
    devDefault: devDefaultRedisToken,
  }),
  BETTER_AUTH_SECRET: str({
    devDefault: devDefaultBetterAuthSecret,
  }),
  BETTER_AUTH_URL: str({
    devDefault: devDefaultBetterAuthUrl,
  }),
  IS_ANTHROPIC_DOWN_URL: str({
    devDefault: devDefaultIsAnthropicDownUrl,
  }),
  IS_ANTHROPIC_DOWN_API_SECRET: str({
    devDefault: devDefaultIsAnthropicDownApiSecret,
  }),
  // Used to authenticate internal request between services (eg. www -> broadcast)
  INTERNAL_SHARED_SECRET: str({
    devDefault: devDefaultInternalSharedSecret,
  }),
  // Vercel cron jobs
  CRON_SECRET: str({
    devDefault: devDefaultCronSecret,
  }),
  // Master key for encrypting sensitive user data at rest (e.g. user credentials)
  ENCRYPTION_MASTER_KEY: str({
    devDefault: "dev-encryption-master-key-32chars!!",
  }),

  // AI Providers (users provide their own keys via credentials UI)
  ANTHROPIC_API_KEY: str({ allowEmpty: true, default: "" }),
  OPENAI_API_KEY: str({ allowEmpty: true, default: "" }),
  OPENROUTER_API_KEY: str({ allowEmpty: true, default: "" }),
  GOOGLE_AI_STUDIO_API_KEY: str({ allowEmpty: true, default: "" }),

  // Deprecated, use LOCALHOST_PUBLIC_DOMAIN instead
  NGROK_DOMAIN: str({ allowEmpty: true, default: "" }),
  LOCALHOST_PUBLIC_DOMAIN: str({ allowEmpty: true, default: "" }),

  // R2 (optional in development - file uploads won't work without these)
  R2_ACCESS_KEY_ID: str({ allowEmpty: true, default: "" }),
  R2_SECRET_ACCESS_KEY: str({ allowEmpty: true, default: "" }),
  R2_ACCOUNT_ID: str({ allowEmpty: true, default: "" }),
  R2_BUCKET_NAME: str({ allowEmpty: true, default: "" }),
  R2_PRIVATE_BUCKET_NAME: str({ allowEmpty: true, default: "" }),
  R2_PUBLIC_URL: str({ allowEmpty: true, default: "" }),
  R2_ENDPOINT: str({ allowEmpty: true, default: "" }),

  // Sandbox providers (E2B optional if using Docker in development)
  E2B_API_KEY: str({ allowEmpty: true, default: "" }),
  DAYTONA_API_KEY: str({ default: "", allowEmpty: true }),

  // GitHub App (optional in development - GitHub features won't work without these)
  GITHUB_CLIENT_ID: str({ allowEmpty: true, default: "" }),
  GITHUB_CLIENT_SECRET: str({ allowEmpty: true, default: "" }),
  NEXT_PUBLIC_GITHUB_APP_NAME: str({ allowEmpty: true, default: "" }),
  GITHUB_WEBHOOK_SECRET: str({ allowEmpty: true, default: "" }),
  GITHUB_APP_ID: str({ allowEmpty: true, default: "" }),
  GITHUB_APP_PRIVATE_KEY: str({ allowEmpty: true, default: "" }),

  // Posthog
  NEXT_PUBLIC_POSTHOG_KEY: str({
    default: "phc_ITvLHD24gmXmQ4IbWa9DqWJyQZNJweLW8vOTpT9WkjS",
    allowEmpty: true,
  }),
  NEXT_PUBLIC_POSTHOG_HOST: str({
    default: "https://us.i.posthog.com",
    allowEmpty: true,
  }),

  // Slack Integration
  SLACK_SIGNING_SECRET: str({ allowEmpty: true, default: "" }),
  SLACK_FEEDBACK_WEBHOOK_URL: str({ allowEmpty: true, default: "" }),
  SLACK_CLIENT_ID: str({ allowEmpty: true, default: "" }),
  SLACK_CLIENT_SECRET: str({ allowEmpty: true, default: "" }),

  // Port used by the CLI tool for auth
  CLI_PORT: num({ default: 8742 }),

  // Others
  RESEND_API_KEY: str({ allowEmpty: true, default: "" }),
  DISABLE_ONE_TIME_TOKEN_SIGNIN: bool({ default: true }),

  // Stripe
  STRIPE_SECRET_KEY: str({ allowEmpty: true, default: "" }),
  STRIPE_WEBHOOK_SECRET: str({ allowEmpty: true, default: "" }),
  STRIPE_PRICE_CORE_MONTHLY: str({ allowEmpty: true, default: "" }),
  STRIPE_PRICE_PRO_MONTHLY: str({ allowEmpty: true, default: "" }),
  STRIPE_PRICE_CREDIT_PACK: str({ allowEmpty: true, default: "" }),

  // Loops (marketing email & events)
  LOOPS_API_KEY: str({ allowEmpty: true, default: "" }),
});
