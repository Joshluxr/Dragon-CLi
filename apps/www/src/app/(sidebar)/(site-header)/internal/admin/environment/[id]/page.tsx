import { AdminEnvironmentContent } from "@/components/admin/environment-content";
import { getEnvironmentForAdmin } from "@/server-actions/admin/environment";
import { getAdminUserOrThrow } from "@/lib/auth-server";

export default async function AdminEnvironmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await getAdminUserOrThrow();
  const { id } = await params;
  const environment = await getEnvironmentForAdmin(id);
  return (
    <AdminEnvironmentContent
      environmentIdOrNull={id}
      environmentOrNull={environment ?? null}
    />
  );
}
