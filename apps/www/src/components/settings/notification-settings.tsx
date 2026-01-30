"use client";

import { useNotifications } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import { Label } from "@radix-ui/react-label";
import { Checkbox } from "@/components/ui/checkbox";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";

export function NotificationSettings() {
  const { isSupported, permission, enabled, setEnabled, requestPermission } =
    useNotifications();

  if (!isSupported) {
    return (
      <div className="flex items-start justify-between gap-4 py-2 rounded-md px-2 -mx-2 flex-col sm:flex-row">
        <div className="flex flex-col gap-1 flex-1">
          <Label className="text-sm font-semibold">Browser notifications</Label>
          <span className="text-xs text-muted-foreground">
            Your browser does not support notifications
          </span>
        </div>
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <div className="flex items-start justify-between gap-4 py-2 rounded-md px-2 -mx-2 flex-col sm:flex-row">
        <div className="flex flex-col gap-1 flex-1">
          <Label className="text-sm font-semibold">Browser notifications</Label>
          <span className="text-xs text-muted-foreground">
            Notifications are blocked. To re-enable:
          </span>
          <ol className="text-xs text-muted-foreground list-decimal list-inside mt-1 space-y-0.5">
            <li>Click the lock icon in your browser's address bar</li>
            <li>Find "Notifications" and change it to "Allow"</li>
            <li>Refresh this page</li>
            <li>
              Ensure notifications are also enabled in your operating system
              settings
            </li>
          </ol>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 h-7 px-2 text-xs"
            onClick={() => {
              // Try to request permission again (some browsers allow retry)
              requestPermission();
            }}
          >
            Try again
          </Button>
        </div>
        <BellOff className="w-4 h-4 text-muted-foreground mt-0.5" />
      </div>
    );
  }

  if (permission !== "granted") {
    return (
      <div className="flex items-start justify-between gap-4 py-2 rounded-md px-2 -mx-2 flex-col sm:flex-row">
        <div className="flex flex-col gap-1 flex-1">
          <Label className="text-sm font-semibold">Browser notifications</Label>
          <span className="text-xs text-muted-foreground">
            Get notified when tasks are complete. You may also need to enable
            notifications for your browser in your operating system settings.
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            const result = await requestPermission();
            if (result === "granted") {
              toast.success("Settings updated.");
            }
          }}
          className="flex items-center gap-2"
        >
          <Bell className="w-3 h-3" />
          Enable
        </Button>
      </div>
    );
  }

  return (
    <Label className="flex items-start justify-between gap-4 py-2 cursor-pointer">
      <Checkbox
        checked={enabled}
        onCheckedChange={(checked) => {
          setEnabled(!!checked);
          toast.success("Settings updated.");
        }}
        className="mt-0.5"
      />
      <div className="flex flex-col gap-1 flex-1">
        <span className="text-sm font-semibold">Browser notifications</span>
        <span className="text-xs text-muted-foreground">
          Get notified when tasks are complete. You may also need to enable
          notifications for your browser in your operating system settings.
        </span>
      </div>
    </Label>
  );
}
