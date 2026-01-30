import type { AuthType } from "@/lib/claude-oauth";
import { ClaudeRedirect } from "@/components/credentials/claude-redirect";

export default async function ClaudeRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ type: AuthType }>;
}) {
  const type = (await searchParams).type;
  return <ClaudeRedirect type={type} />;
}
