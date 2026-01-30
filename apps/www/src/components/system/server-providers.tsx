import { Providers } from "./providers";
import { SidebarProvider } from "../ui/sidebar";
import { cookies } from "next/headers";

export async function ServerProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sidebarCookie = cookieStore.get("sidebar_state");
  const isSidebarOpenCookie = sidebarCookie && sidebarCookie?.value === "true";
  return (
    <SidebarProvider defaultOpen={isSidebarOpenCookie}>
      <Providers>{children}</Providers>
    </SidebarProvider>
  );
}
