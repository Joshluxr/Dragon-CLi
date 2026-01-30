import { getAdminUserOrThrow } from "@/lib/auth-server";
import { getAutomationForAdmin } from "@/server-actions/admin/automation";
import { AdminAutomationDetail } from "@/components/admin/automation-detail";
import { notFound } from "next/navigation";

export default async function AdminAutomationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await getAdminUserOrThrow();
  const { id } = await params;

  try {
    const automation = await getAutomationForAdmin(id);
    return <AdminAutomationDetail automation={automation} />;
  } catch (error) {
    notFound();
  }
}
