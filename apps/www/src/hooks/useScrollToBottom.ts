import {
  useCallback,
  useEffect,
  useRef,
  type RefObject,
  useState,
} from "react";
import { isIOSSafari } from "@/lib/browser-utils";

function getScrollParentOrNull(
  element: HTMLElement | null,
): HTMLElement | null {
  if (!element) {
    return null;
  }
  // Find the closest parent that is a scroll area
  let current: HTMLElement | null = element;
  while (current) {
    if (current.getAttribute("data-slot") === "scroll-area-viewport") {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

export function useScrollToBottom(): {
  messagesEndRef: RefObject<HTMLDivElement | null>;
  isAtBottom: boolean;
  forceScrollToBottom: () => void;
} {
  const isAtBottom = useRef(false);
  const [isAtBottomState, setIsAtBottomState] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const container = getScrollParentOrNull(endRef.current);
    if (container) {
      const checkIsAtBottom = () => {
        const atBottom =
          container.scrollTop + container.clientHeight >=
          container.scrollHeight - 10;
        isAtBottom.current = atBottom;
        setIsAtBottomState(atBottom);
        return atBottom;
      };

      // Check initial state
      checkIsAtBottom();

      const onScroll = () => {
        checkIsAtBottom();
      };
      container?.addEventListener("scroll", onScroll);
      return () => {
        container?.removeEventListener("scroll", onScroll);
      };
    }
  }, []);

  const forceScrollToBottom = useCallback(() => {
    const container = getScrollParentOrNull(endRef.current);

    if (isIOSSafari() && container) {
      // iOS Safari has issues with scrollIntoView, use direct scrollTop instead
      // Add a small delay to ensure DOM updates are complete
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    } else if (endRef.current) {
      // For other browsers, use scrollIntoView but with instant behavior on iOS
      endRef.current.scrollIntoView({
        behavior: isIOSSafari() ? "instant" : "smooth",
        block: "start",
      });
    }
  }, []);

  const maybeScrollToBottom = useCallback(() => {
    if (isAtBottom.current) {
      forceScrollToBottom();
    }
  }, [forceScrollToBottom]);

  // Scroll to bottom on mount with iOS Safari delay
  useEffect(() => {
    forceScrollToBottom();
  }, [forceScrollToBottom]);

  useEffect(() => {
    const container = getScrollParentOrNull(endRef.current);
    if (container) {
      const observer = new MutationObserver(() => {
        maybeScrollToBottom();
      });
      observer.observe(container, {
        childList: true,
        subtree: true,
      });
      return () => observer.disconnect();
    }
  }, [maybeScrollToBottom]);
  return {
    messagesEndRef: endRef,
    isAtBottom: isAtBottomState,
    forceScrollToBottom,
  };
}
