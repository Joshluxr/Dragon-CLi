"use client";

import { useEffect } from "react";
import { usePageHeader, BreadcrumbItem } from "@/contexts/page-header";
import isEqual from "fast-deep-equal";

export function usePageBreadcrumbs(breadcrumbs: BreadcrumbItem[]) {
  const { breadcrumbs: currentBreadcrumbs, setBreadcrumbs } = usePageHeader();
  useEffect(() => {
    if (!isEqual(currentBreadcrumbs, breadcrumbs)) {
      setBreadcrumbs(breadcrumbs);
    }
  }, [breadcrumbs, currentBreadcrumbs, setBreadcrumbs]);
}
