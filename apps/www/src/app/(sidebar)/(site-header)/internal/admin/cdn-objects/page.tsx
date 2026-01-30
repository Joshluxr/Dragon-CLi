import { getAdminUserOrThrow } from "@/lib/auth-server";
import { R2TreeView } from "@/components/admin/r2-tree-view";
import { listR2Objects } from "@/server-actions/admin/r2-objects";

export default async function AdminCdnObjectsPage() {
  await getAdminUserOrThrow();
  const initialData = await listR2Objects();

  return <R2TreeView initialData={initialData.tree} />;
}
