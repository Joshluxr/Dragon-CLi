"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  cancelAllSubscriptionsAtPeriodEnd,
  type CancelAllResult,
} from "@/server-actions/admin/subscriptions";

interface ShutdownControlsProps {
  initialSubscriptionCount: number;
}

export function ShutdownControls({
  initialSubscriptionCount,
}: ShutdownControlsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CancelAllResult | null>(null);
  const [subscriptionCount, setSubscriptionCount] = useState(
    initialSubscriptionCount,
  );

  const handleCancelAll = async () => {
    setIsLoading(true);
    setResult(null);

    try {
      const res = await cancelAllSubscriptionsAtPeriodEnd();
      setResult(res);
      setSubscriptionCount(0);

      if (res.failed === 0) {
        toast.success(
          `Successfully canceled ${res.success} subscriptions at period end`,
        );
      } else {
        toast.warning(
          `Canceled ${res.success} subscriptions, ${res.failed} failed`,
        );
      }
    } catch (error) {
      toast.error(
        `Failed to cancel subscriptions: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Shutdown Controls
          </CardTitle>
          <CardDescription>
            Manage the Terragon shutdown process. These actions are
            irreversible.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>
              Terragon is shutting down on February 14th, 2026. Use these
              controls to manage the shutdown process.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h3 className="font-medium">Active Subscriptions</h3>
                <p className="text-sm text-muted-foreground">
                  Number of subscriptions that will be canceled
                </p>
              </div>
              <div className="text-2xl font-bold">{subscriptionCount}</div>
            </div>

            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="destructive"
                  disabled={isLoading || subscriptionCount === 0}
                  className="w-full"
                >
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Cancel All Subscriptions at Period End
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Are you absolutely sure?</DialogTitle>
                  <DialogDescription>
                    This will cancel <strong>{subscriptionCount}</strong> active
                    subscriptions at the end of their current billing period.
                    Users will not be charged again but will retain access until
                    their period ends.
                    <br />
                    <br />
                    <strong>This action cannot be undone.</strong>
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button onClick={handleCancelAll} variant="destructive">
                      Yes, cancel all subscriptions
                    </Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {result && (
            <div className="space-y-4">
              <h3 className="font-medium">Results</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2 p-3 border rounded-lg bg-green-50 dark:bg-green-900/20">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <div>
                    <p className="font-medium text-green-700 dark:text-green-300">
                      {result.success}
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400">
                      Canceled
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 border rounded-lg bg-red-50 dark:bg-red-900/20">
                  <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  <div>
                    <p className="font-medium text-red-700 dark:text-red-300">
                      {result.failed}
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-400">
                      Failed
                    </p>
                  </div>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-destructive">
                    Errors:
                  </h4>
                  <div className="max-h-40 overflow-auto">
                    {result.errors.map((err, i) => (
                      <div
                        key={i}
                        className="text-xs p-2 bg-destructive/10 rounded mb-1"
                      >
                        <span className="font-mono">{err.id}</span>: {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
