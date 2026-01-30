import { SandboxSettings } from "@/components/settings/tab/sandbox";
import { getUserIdOrRedirect } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { getFeatureFlagForUser } from "@terragon/shared/model/feature-flags";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Sandbox Settings | Terragon",
};

export default async function SandboxSettingsPage() {
  const userId = await getUserIdOrRedirect();
  const daytonaOptionsForSandboxProvider = await getFeatureFlagForUser({
    db,
    userId,
    flagName: "daytonaOptionsForSandboxProvider",
  });
  if (!daytonaOptionsForSandboxProvider) {
    redirect("/settings");
  }
  return <SandboxSettings />;
}
