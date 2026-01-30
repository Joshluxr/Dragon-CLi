import { getAdminUserOrThrow } from "@/lib/auth-server";
import { CreditTesterContent } from "@/components/admin/credit-tester";

export default async function AdminCreditTesterPage() {
  await getAdminUserOrThrow();
  return <CreditTesterContent />;
}
