import { GitHubSettings } from "@/components/settings/tab/github";
import { getUserIdOrRedirect } from "@/lib/auth-server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GitHub Settings | Dragon",
};

export default async function GitHubSettingsPage() {
  await getUserIdOrRedirect();
  return <GitHubSettings />;
}
