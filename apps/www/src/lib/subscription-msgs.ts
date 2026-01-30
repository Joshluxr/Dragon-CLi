/**
 * Subscription error messages
 * Centralized location for all subscription-related error messages
 */

export const SUBSCRIPTION_MESSAGES = {
  CREATE_TASK:
    "You need an active subscription to create a task. Visit Settings → Billing to subscribe.",
  FOLLOW_UP:
    "You need an active subscription to follow up on a task. Visit Settings → Billing to subscribe.",
  QUEUE_FOLLOW_UP:
    "You need an active subscription to queue follow-ups. Visit Settings → Billing to subscribe.",
  RUN_TASK:
    "You need an active subscription to run tasks. Visit Settings → Billing to subscribe.",
  RUN_AUTOMATION:
    "You need an active subscription to run automations. Visit Settings → Billing to subscribe.",
  CREATE_AUTOMATION:
    "You need an active subscription to create automations. Visit Settings → Billing to subscribe.",
} as const;
