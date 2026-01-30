"use client";

import { useState } from "react";
import { DollarSign, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { CostLimits } from "@terragon/shared";
import { updateCostLimitsAction } from "@/server-actions/usage";

interface CostLimitsSettingsProps {
  limits: CostLimits | null;
}

export function CostLimitsSettings({ limits }: CostLimitsSettingsProps) {
  const [dailyLimit, setDailyLimit] = useState(
    limits?.dailyLimitCents ? limits.dailyLimitCents / 100 : 0,
  );
  const [monthlyLimit, setMonthlyLimit] = useState(
    limits?.monthlyLimitCents ? limits.monthlyLimitCents / 100 : 0,
  );
  const [alertThreshold, setAlertThreshold] = useState(
    limits?.alertThresholdPercent || 80,
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateCostLimitsAction({
        dailyLimitCents: dailyLimit > 0 ? Math.round(dailyLimit * 100) : null,
        monthlyLimitCents:
          monthlyLimit > 0 ? Math.round(monthlyLimit * 100) : null,
        alertThresholdPercent: alertThreshold,
      });
      toast.success("Cost limits saved successfully");
    } catch (error) {
      toast.error("Failed to save cost limits");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Cost Limits
        </CardTitle>
        <CardDescription>
          Set spending limits to control costs. You&apos;ll receive alerts when
          approaching limits.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="daily-limit">Daily Limit ($)</Label>
            <Input
              id="daily-limit"
              type="number"
              min="0"
              step="0.01"
              value={dailyLimit || ""}
              onChange={(e) => setDailyLimit(Number(e.target.value) || 0)}
              placeholder="No limit"
            />
            <p className="text-xs text-muted-foreground">
              Set to 0 for no daily limit
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="monthly-limit">Monthly Limit ($)</Label>
            <Input
              id="monthly-limit"
              type="number"
              min="0"
              step="0.01"
              value={monthlyLimit || ""}
              onChange={(e) => setMonthlyLimit(Number(e.target.value) || 0)}
              placeholder="No limit"
            />
            <p className="text-xs text-muted-foreground">
              Set to 0 for no monthly limit
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <Label htmlFor="alert-threshold">Alert Threshold (%)</Label>
          <div className="flex items-center gap-4">
            <Input
              id="alert-threshold"
              type="number"
              min="50"
              max="95"
              step="5"
              value={alertThreshold}
              onChange={(e) =>
                setAlertThreshold(
                  Math.min(95, Math.max(50, Number(e.target.value) || 80)),
                )
              }
              className="w-24"
            />
            <div className="flex items-start gap-2 text-sm text-muted-foreground flex-1">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>
                Receive alerts when spending reaches {alertThreshold}% of your
                limit
              </p>
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Limits"}
        </Button>
      </CardContent>
    </Card>
  );
}
