import { useEffect, useState } from "react";

export function useDocumentVisibility() {
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    typeof document !== "undefined" ? !document.hidden : true,
  );
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsDocumentVisible(!document.hidden);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);
  return isDocumentVisible;
}
