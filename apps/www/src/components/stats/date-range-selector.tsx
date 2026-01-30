"use client";

import { Button } from "@/components/ui/button";

export function DateRangeSelector({
  numDays,
  onNumDaysChange,
}: {
  numDays: number;
  onNumDaysChange: (numDays: number) => void;
}) {
  const isSevenDays = numDays === 7;
  const isThirtyDays = numDays === 30;

  return (
    <div className="flex gap-2">
      <Button
        variant={isSevenDays ? "default" : "outline"}
        size="sm"
        onClick={() => {
          onNumDaysChange(7);
        }}
      >
        Last 7 days
      </Button>
      <Button
        variant={isThirtyDays ? "default" : "outline"}
        size="sm"
        onClick={() => {
          onNumDaysChange(30);
        }}
      >
        Last 30 days
      </Button>
    </div>
  );
}
