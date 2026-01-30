import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function usePlatform() {
  const [platform, setPlatform] = React.useState<
    "unknown" | "mobile" | "desktop"
  >("unknown");

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setPlatform(window.innerWidth < MOBILE_BREAKPOINT ? "mobile" : "desktop");
    };
    mql.addEventListener("change", onChange);
    setPlatform(window.innerWidth < MOBILE_BREAKPOINT ? "mobile" : "desktop");
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return platform;
}
