import { getAdminUserOrThrow } from "@/lib/auth-server";
import { BannerAdmin } from "@/components/admin/banner";

export default async function BannerAdminPage() {
  await getAdminUserOrThrow();
  return <BannerAdmin />;
}
