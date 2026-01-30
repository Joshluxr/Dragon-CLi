"use client";

import { useNotifications } from "@/hooks/use-notifications";

export function NotificationProvider() {
  useNotifications();

  // This component doesn't render anything, it just sets up the notification listener
  return null;
}
