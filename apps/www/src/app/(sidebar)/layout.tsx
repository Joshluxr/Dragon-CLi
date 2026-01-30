import { AppSidebar } from "@/components/app-sidebar";
import { NotificationProvider } from "@/components/system/notification-provider";
import { getUserIdOrNull } from "@/lib/auth-server";

export default async function SidebarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userId = await getUserIdOrNull();
  return (
    <div
      className="group/sidebar-wrapper flex min-h-svh w-full"
      style={
        {
          "--sidebar-width": "18rem",
          "--sidebar-width-mobile": "18rem",
        } as React.CSSProperties
      }
    >
      {userId ? (
        <>
          <NotificationProvider />
          <AppSidebar />
        </>
      ) : null}
      {children}
    </div>
  );
}
