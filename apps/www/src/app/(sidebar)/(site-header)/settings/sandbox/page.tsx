import { SandboxSettings } from "@/components/settings/tab/sandbox";
import { getUserIdOrRedirect } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { getFeatureFlagForUser } from "@dragon/shared/model/feature-flags";
import { showSandboxSettings } from "@dragon/env/next-public";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Sandbox Settings | Dragon",
};

export default async function SandboxSettingsPage() {
  const userId = await getUserIdOrRedirect();
  const daytonaOptionsForSandboxProvider = await getFeatureFlagForUser({
    db,
    userId,
    flagName: "daytonaOptionsForSandboxProvider",
  });
  if (!daytonaOptionsForSandboxProvider && !showSandboxSettings()) {
    redirect("/settings");
  }
  return <SandboxSettings />;
}
