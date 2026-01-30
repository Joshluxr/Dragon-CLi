import { AdminThreadContent } from "@/components/admin/thread-content";
import { getThreadForAdmin } from "@/server-actions/admin/thread";
import { getAdminUserOrThrow } from "@/lib/auth-server";

export default async function AdminThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await getAdminUserOrThrow();
  const { id } = await params;
  const thread = await getThreadForAdmin(id);
  return (
    <AdminThreadContent threadIdOrNull={id} threadOrNull={thread ?? null} />
  );
}
