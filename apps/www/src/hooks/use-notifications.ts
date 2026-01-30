import { useEffect, useCallback, useState } from "react";
import { useRealtimeUser } from "./useRealtime";
import { useRouter } from "next/navigation";
import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";

// Store notification permission state
export const notificationPermissionAtom =
  atomWithStorage<NotificationPermission | null>(
    "notificationPermission",
    null,
  );

// Store whether notifications are enabled
export const notificationsEnabledAtom = atomWithStorage<boolean>(
  "notificationsEnabled",
  false,
);

export function useNotifications() {
  const router = useRouter();
  const [permission, setPermission] = useAtom(notificationPermissionAtom);
  const [enabled, setEnabled] = useAtom(notificationsEnabledAtom);
  const [isSupported, setIsSupported] = useState(false);

  // Check if notifications are supported after mount
  useEffect(() => {
    setIsSupported("Notification" in window);
  }, []);

  // Request notification permission
  const requestPermission = useCallback(async () => {
    if (!isSupported) return "denied";

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") {
        setEnabled(true);
      }
      return result;
    } catch (error) {
      console.error("Error requesting notification permission:", error);
      return "denied";
    }
  }, [isSupported, setPermission, setEnabled]);

  // Check current permission status
  useEffect(() => {
    if (isSupported) {
      // Check permission on mount and when window regains focus
      const checkPermission = () => {
        const currentPermission = Notification.permission;
        if (currentPermission !== permission) {
          setPermission(currentPermission);
          // If permission was granted, auto-enable notifications
          if (currentPermission === "granted" && !enabled) {
            setEnabled(true);
          }
        }
      };

      checkPermission();

      // Recheck permission when window regains focus (user might have changed browser settings)
      window.addEventListener("focus", checkPermission);

      return () => window.removeEventListener("focus", checkPermission);
    }
  }, [isSupported, permission, enabled, setPermission, setEnabled]);

  // Show notification
  const showNotification = useCallback(
    (title: string, options?: NotificationOptions & { threadId?: string }) => {
      if (!isSupported || !enabled || permission !== "granted") return;

      try {
        // Remove threadId from options before passing to Notification
        const { threadId, ...notificationOptions } = options || {};

        const notification = new Notification(title, {
          icon: "/favicon.png",
          badge: "/favicon.png",
          ...notificationOptions,
        });

        // Handle click - navigate to thread if threadId provided
        if (threadId) {
          notification.onclick = () => {
            router.push(`/task/${threadId}`);
            notification.close();
            window.focus();
          };
        }

        // Auto close after 10 seconds
        setTimeout(() => notification.close(), 10000);
      } catch (error) {
        console.error("Error showing notification:", error);
      }
    },
    [isSupported, enabled, permission, router],
  );

  // Listen for unread thread updates
  useRealtimeUser({
    matches: (message) => {
      // Only match if notifications are supported
      if (!isSupported) {
        return false;
      }
      // Match when a thread is marked as unread
      if (message.data.isThreadUnread === true) {
        return true;
      }
      // Also check dataByThreadId for batch updates
      if (message.dataByThreadId) {
        for (const data of Object.values(message.dataByThreadId)) {
          if (data.isThreadUnread === true) {
            return true;
          }
        }
      }
      return false;
    },
    onMessage: (message) => {
      if (!isSupported || !enabled || permission !== "granted") return;

      // Handle single thread update
      if (message.data.threadId && message.data.isThreadUnread === true) {
        const threadId = message.data.threadId;
        const threadName = message.data.threadName;

        // Show notification if tab is not active, even if we're on the thread
        const currentPath = window.location.pathname;
        const isOnThread = currentPath === `/task/${threadId}`;
        const isTabActive = !document.hidden;

        // Only skip notification if we're on the thread AND the tab is active
        if (isOnThread && isTabActive) return;

        showNotification("A Task is Finished Working", {
          body: threadName || "A thread has been marked as unread",
          tag: `thread-${threadId}`,
          requireInteraction: false,
          threadId,
        });
      }

      // Handle batch updates
      if (message.dataByThreadId) {
        for (const [threadId, data] of Object.entries(message.dataByThreadId)) {
          if (data.isThreadUnread === true) {
            // Show notification if tab is not active, even if we're on the thread
            const currentPath = window.location.pathname;
            const isOnThread = currentPath === `/task/${threadId}`;
            const isTabActive = !document.hidden;

            // Only skip notification if we're on the thread AND the tab is active
            if (isOnThread && isTabActive) return;

            const threadName = data.threadName;

            showNotification("A Task is Finished Working", {
              body: threadName || "A thread has been marked as unread",
              tag: `thread-${threadId}`,
              requireInteraction: false,
              threadId,
            });
          }
        }
      }
    },
  });

  return {
    isSupported,
    permission,
    enabled,
    setEnabled,
    requestPermission,
    showNotification,
  };
}
