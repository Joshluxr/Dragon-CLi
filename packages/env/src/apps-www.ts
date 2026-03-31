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

  // AI Providers
  ANTHROPIC_API_KEY: str(),
  OPENAI_API_KEY: str(),
  OPENROUTER_API_KEY: str({ allowEmpty: true, default: "" }),
  GOOGLE_AI_STUDIO_API_KEY: str({ allowEmpty: true, default: "" }),

  // Deprecated, use LOCALHOST_PUBLIC_DOMAIN instead
  NGROK_DOMAIN: str({ allowEmpty: true, default: "" }),
  LOCALHOST_PUBLIC_DOMAIN: str({ allowEmpty: true, default: "" }),
  /** Full base URL for sandboxes to reach the app (e.g. http://1.2.3.4:3000). Overrides LOCALHOST_PUBLIC_DOMAIN in dev when set. */
  SANDBOX_PUBLIC_APP_URL: str({ allowEmpty: true, default: "" }),

  // R2
  R2_ACCESS_KEY_ID: str(),
  R2_SECRET_ACCESS_KEY: str(),
  R2_ACCOUNT_ID: str(),
  R2_BUCKET_NAME: str(),
  R2_PRIVATE_BUCKET_NAME: str(),
  R2_PUBLIC_URL: str(),
  R2_ENDPOINT: str({ allowEmpty: true, default: "" }),

  // Sandbox providers
  E2B_API_KEY: str(),
  DAYTONA_API_KEY: str({ default: "", allowEmpty: true }),
  OPEN_SANDBOX_DOMAIN: str({ default: "", allowEmpty: true }),
  OPEN_SANDBOX_API_KEY: str({ default: "", allowEmpty: true }),
  OPEN_SANDBOX_PROTOCOL: str({ default: "http", allowEmpty: true }),
  OPEN_SANDBOX_USE_SERVER_PROXY: str({ default: "", allowEmpty: true }),
  OPEN_SANDBOX_ENTRYPOINT: str({ default: "", allowEmpty: true }),
  OPEN_SANDBOX_IMAGE: str({ default: "", allowEmpty: true }),
  /** Max wait for OpenSandbox execd readiness (SDK default 30s is often too short). */
  OPEN_SANDBOX_READY_TIMEOUT_SECONDS: str({ default: "", allowEmpty: true }),
  OPEN_SANDBOX_HEALTH_POLL_INTERVAL_MS: str({ default: "", allowEmpty: true }),
  OPEN_SANDBOX_REQUEST_TIMEOUT_SECONDS: str({ default: "", allowEmpty: true }),

  // HolyClaude bundle for OpenSandbox sandboxes (see packages/sandbox/src/holyclaude-opensandbox.ts)
  HOLYCLAUDE_IN_OPEN_SANDBOX: str({ default: "", allowEmpty: true }),
  HOLYCLAUDE_REPO_URL: str({ default: "", allowEmpty: true }),
  HOLYCLAUDE_VARIANT: str({ default: "", allowEmpty: true }),
  HOLYCLAUDE_SKIP_NPM_GLOBALS: str({ default: "", allowEmpty: true }),
  /** Force HolyClaude bootstrap on OpenSandbox even if marker file exists */
  HOLYCLAUDE_REINSTALL_OPEN_SANDBOX: str({ default: "", allowEmpty: true }),

  // Sandbox UI / defaults (self-hosted)
  NEXT_PUBLIC_SHOW_SANDBOX_SETTINGS: str({ default: "", allowEmpty: true }),
  DEFAULT_SANDBOX_PROVIDER_FOR_USER: str({ default: "", allowEmpty: true }),

  // GitHub App
  GITHUB_CLIENT_ID: str(),
  GITHUB_CLIENT_SECRET: str(),
  NEXT_PUBLIC_GITHUB_APP_NAME: str({ devDefault: "" }),
  GITHUB_WEBHOOK_SECRET: str(),
  GITHUB_APP_ID: str(),
  GITHUB_APP_PRIVATE_KEY: str(),

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
