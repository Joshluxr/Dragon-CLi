import { AdminGithubPRContent } from "@/components/admin/github-pr-content";
import { getGithubPRForAdmin } from "@/server-actions/admin/github-pr";
import { getAdminUserOrThrow } from "@/lib/auth-server";

export default async function AdminGithubPRPage({
  params,
}: {
  params: Promise<{ repoAndPRNumber: string[] }>;
}) {
  await getAdminUserOrThrow();
  const { repoAndPRNumber } = await params;
  if (repoAndPRNumber.length !== 3) {
    throw new Error("Invalid path");
  }
  const [repoOwner, repoName, prNumber] = repoAndPRNumber;
  if (!repoOwner || !repoName || !prNumber) {
    throw new Error("Invalid path");
  }
  const repoFullName = `${repoOwner}/${repoName}`;
  const prNumberInt = parseInt(prNumber, 10);
  const pr = isNaN(prNumberInt)
    ? null
    : await getGithubPRForAdmin({
        prNumber: prNumberInt,
        repoFullName,
      });
  return (
    <AdminGithubPRContent
      repoFullName={repoFullName}
      prNumber={prNumber}
      prOrNull={pr ?? null}
    />
  );
}
