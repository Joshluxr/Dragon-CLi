import { useEffect } from "react";

export function useUnsavedChangesWarning(hasUnsavedChanges: boolean) {
  useEffect(() => {
    // Browser navigation warning (refresh, close tab, etc.)
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        // Chrome requires returnValue to be set
        e.returnValue = "";
        return "";
      }
    };
    if (hasUnsavedChanges) {
      window.addEventListener("beforeunload", handleBeforeUnload);
    }
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges]);
}
