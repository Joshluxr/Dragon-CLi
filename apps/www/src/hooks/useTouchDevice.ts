"use client";

import { useEffect, useState } from "react";

// Device is considered a mobile touch device (phone/tablet) if:
// 1. It has touch capability AND
// 2. It's actually a mobile device (not a laptop with touchscreen)
function calculateIsTouchDevice(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  // Check if device has touch capability
  const hasTouch =
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    // @ts-expect-error - for older browsers
    navigator.msMaxTouchPoints > 0;

  if (!hasTouch) {
    return false;
  }

  // Now distinguish between mobile devices and laptops with touchscreens
  // Mobile devices typically:
  // 1. Have no hover capability OR have coarse pointers
  // 2. Have smaller screens
  // 3. Match mobile user agent patterns

  const hasHover = window.matchMedia("(hover: hover)").matches;
  const hasCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const isSmallScreen = window.matchMedia("(max-width: 768px)").matches;

  // Check for mobile user agent patterns
  const mobileRegex =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  const isMobileUserAgent = mobileRegex.test(navigator.userAgent);

  // A device is considered a mobile touch device if:
  // - It matches mobile user agent patterns OR
  // - It has no hover capability and has a coarse pointer OR
  // - It has a small screen and coarse pointer
  return (
    isMobileUserAgent ||
    (!hasHover && hasCoarsePointer) ||
    (isSmallScreen && hasCoarsePointer)
  );
}

export function useTouchDevice() {
  const [isTouchDevice, setIsTouchDevice] = useState(() =>
    calculateIsTouchDevice(),
  );

  useEffect(() => {
    const checkTouchDevice = () => {
      setIsTouchDevice(calculateIsTouchDevice());
    };

    // Listen for changes in hover capability (e.g., when connecting/disconnecting a mouse)
    const hoverMediaQuery = window.matchMedia("(hover: hover)");
    const pointerMediaQuery = window.matchMedia("(pointer: coarse)");
    const screenSizeMediaQuery = window.matchMedia("(max-width: 768px)");

    // Use addEventListener with the handleChange function
    hoverMediaQuery.addEventListener("change", checkTouchDevice);
    pointerMediaQuery.addEventListener("change", checkTouchDevice);
    screenSizeMediaQuery.addEventListener("change", checkTouchDevice);

    return () => {
      hoverMediaQuery.removeEventListener("change", checkTouchDevice);
      pointerMediaQuery.removeEventListener("change", checkTouchDevice);
      screenSizeMediaQuery.removeEventListener("change", checkTouchDevice);
    };
  }, []);

  return isTouchDevice;
}
