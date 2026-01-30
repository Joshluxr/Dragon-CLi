import { getAdminUserOrThrow } from "@/lib/auth-server";
import { AdminImageUpload } from "@/components/admin/image-upload";

export default async function AdminImagesPage() {
  await getAdminUserOrThrow();

  return <AdminImageUpload />;
}
