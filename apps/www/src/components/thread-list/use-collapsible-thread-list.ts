import { useCallback } from "react";
import { useAtom } from "jotai";
import { threadListCollapsedAtom } from "@/atoms/user-cookies";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/components/ui/sidebar";

export function useCollapsibleThreadList() {
  const { isMobile } = useSidebar();
  const pathname = usePathname();
  const [isThreadListCollapsedCookie, setIsThreadListCollapsedCookie] = useAtom(
    threadListCollapsedAtom,
  );
  const canCollapseThreadList = !isMobile && pathname !== "/dashboard";
  const setThreadListCollapsed = useCallback(
    (collapsed: boolean) => {
      if (canCollapseThreadList) {
        setIsThreadListCollapsedCookie(collapsed);
      }
    },
    [canCollapseThreadList, setIsThreadListCollapsedCookie],
  );
  return {
    canCollapseThreadList,
    isThreadListCollapsed: canCollapseThreadList && isThreadListCollapsedCookie,
    setThreadListCollapsed,
  };
}
