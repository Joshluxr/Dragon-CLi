"use server";

import { db } from "@/lib/db";
import { adminOnly } from "@/lib/auth-server";
import { User } from "@terragon/shared";
import * as z from "zod/v4";
import { Resend } from "resend";
import { env } from "@terragon/env/apps-www";
import { WaitlistWelcomeEmail } from "@terragon/transactional/emails/waitlist-welcome";
import { OnboardingCompletionReminderEmail } from "@terragon/transactional/emails/onboarding-completion-reminder";
import { generateAccessCode } from "@terragon/shared/model/access-codes";
import {
  getEligibleReengagementRecipients,
  recordReengagementEmail,
} from "@terragon/shared/model/reengagement-emails";
import {
  getEligibleOnboardingCompletionRecipients,
  recordOnboardingCompletionEmail,
} from "@terragon/shared/model/onboarding-completion-emails";

export const sendOnboardingEmail = adminOnly(async function sendOnboardingEmail(
  adminUser: User,
  email: string,
) {
  console.log("sendOnboardingEmail", email);

  try {
    z.string().email().parse(email);
  } catch (error) {
    throw new Error("Invalid email");
  }

  // Generate access code for this email
  const accessCode = await generateAccessCode({
    db,
    createdByUserId: adminUser.id,
    options: {
      email,
    },
  });

  if (!accessCode) {
    throw new Error("Failed to generate access code");
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_VERCEL_ENV === "preview"
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL}`
      : env.BETTER_AUTH_URL;
  const accessLink = `${baseUrl}/invited?code=${accessCode.code}`;

  const resend = new Resend(env.RESEND_API_KEY ?? "DUMMY_KEY");

  const result = await resend.emails.send({
    from: "The Terragon Team <onboarding@mail.terragonlabs.com>",
    to: email,
    replyTo: "support@terragonlabs.com",
    subject: "Welcome to the Terragon Alpha!",
    react: <WaitlistWelcomeEmail accessLink={accessLink} />,
  });

  if (result.error) {
    throw new Error(`Failed to send onboarding email: ${result.error.message}`);
  }

  return {
    success: true,
    messageId: result.data?.id,
    accessCode: accessCode.code,
  };
});

export const getReengagementPreview = adminOnly(
  async function getReengagementPreview() {
    console.log("getReengagementPreview");
    const eligibleRecipients = await getEligibleReengagementRecipients({
      db,
      days: 2,
    });
    return {
      recipients: eligibleRecipients.map((r) => ({
        email: r.email!,
        accessCodeId: r.id,
        code: r.code,
        createdAt: r.createdAt,
      })),
      count: eligibleRecipients.length,
    };
  },
);

export const sendReengagementEmails = adminOnly(async (adminUser: User) => {
  console.log("sendReengagementEmails");
  const eligibleRecipients = await getEligibleReengagementRecipients({
    db,
    days: 2,
  });
  if (eligibleRecipients.length === 0) {
    return {
      success: true,
      sent: 0,
      failed: 0,
      errors: [],
    };
  }

  const resend = new Resend(env.RESEND_API_KEY ?? "DUMMY_KEY");
  const baseUrl =
    process.env.NEXT_PUBLIC_VERCEL_ENV === "preview"
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL}`
      : env.BETTER_AUTH_URL;

  const results = {
    sent: 0,
    failed: 0,
    errors: [] as string[],
  };

  // Send emails in batches to avoid rate limiting
  for (const recipient of eligibleRecipients) {
    if (!recipient.email) continue;

    try {
      const accessLink = `${baseUrl}/invited?code=${recipient.code}`;

      const result = await resend.emails.send({
        from: "The Terragon Team <onboarding@mail.terragonlabs.com>",
        to: recipient.email,
        replyTo: "support@terragonlabs.com",
        subject: "Reminder: Redeem Terragon Access Code",
        react: <WaitlistWelcomeEmail accessLink={accessLink} />,
      });

      if (result.error) {
        results.failed++;
        results.errors.push(
          `Failed to send to ${recipient.email}: ${result.error.message}`,
        );
      } else {
        // Record that we sent the email
        await recordReengagementEmail({
          db,
          email: recipient.email,
          accessCodeId: recipient.id,
          sentByUserId: adminUser.id,
        });
        results.sent++;
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      results.failed++;
      results.errors.push(
        `Failed to send to ${recipient.email}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  return {
    success: true,
    ...results,
  };
});

export const getOnboardingCompletionPreview = adminOnly(async () => {
  console.log("getOnboardingCompletionPreview");
  const eligibleUsers = await getEligibleOnboardingCompletionRecipients({
    db,
  });
  return {
    recipients: eligibleUsers,
    count: eligibleUsers.length,
  };
});

export const sendOnboardingCompletionEmails = adminOnly(
  async (adminUser: User) => {
    console.log("sendOnboardingCompletionEmails");
    const eligibleUsers = await getEligibleOnboardingCompletionRecipients({
      db,
    });
    if (eligibleUsers.length === 0) {
      return {
        success: true,
        sent: 0,
        failed: 0,
        errors: [],
      };
    }

    const resend = new Resend(env.RESEND_API_KEY ?? "DUMMY_KEY");
    const baseUrl =
      process.env.NEXT_PUBLIC_VERCEL_ENV === "preview"
        ? `https://${process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL}`
        : env.BETTER_AUTH_URL;

    const results = {
      sent: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Send emails in batches to avoid rate limiting
    for (const user of eligibleUsers) {
      try {
        const dashboardLink = `${baseUrl}/`;

        const result = await resend.emails.send({
          from: "The Terragon Team <onboarding@mail.terragonlabs.com>",
          to: user.email,
          replyTo: "support@terragonlabs.com",
          subject: "Forget something?",
          react: (
            <OnboardingCompletionReminderEmail dashboardLink={dashboardLink} />
          ),
        });

        if (result.error) {
          results.failed++;
          results.errors.push(
            `Failed to send to ${user.email}: ${result.error.message}`,
          );
        } else {
          // Record that we sent the email
          await recordOnboardingCompletionEmail({
            db,
            userId: user.id,
            email: user.email,
            sentByUserId: adminUser.id,
          });
          results.sent++;
        }

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        results.failed++;
        results.errors.push(
          `Failed to send to ${user.email}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      }
    }

    return {
      success: true,
      ...results,
    };
  },
);
