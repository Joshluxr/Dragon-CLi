import { SettingsLayout } from "@/components/settings/settings-layout";
import { getUserIdOrRedirect } from "@/lib/auth-server";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await getUserIdOrRedirect();
  return (
    <div className="flex flex-col justify-start w-full max-w-5xl">
      <SettingsLayout>{children}</SettingsLayout>
    </div>
  );
}
