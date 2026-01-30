"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";

export function ImpersonateUserButton({ userId }: { userId: string }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleImpersonate = async () => {
    try {
      setIsLoading(true);
      await authClient.admin.impersonateUser({
        userId,
      });
      // We want a full page refresh here.
      window.location.href = `/`;
    } catch (error) {
      console.error("Failed to impersonate user:", error);
      toast.error("Failed to impersonate user");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button onClick={handleImpersonate} disabled={isLoading}>
      {isLoading ? "Impersonating..." : "Impersonate"}
    </Button>
  );
}
