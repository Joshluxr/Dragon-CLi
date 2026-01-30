"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectItem,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock, Calendar } from "lucide-react";

const RELATIVE_TIMES = [
  { value: "15min", label: "In 15 minutes" },
  { value: "30min", label: "In 30 minutes" },
  { value: "1hour", label: "In 1 hour" },
  { value: "2hours", label: "In 2 hours" },
  { value: "4hours", label: "In 4 hours" },
  { value: "tomorrow", label: "Tomorrow at this time" },
  { value: "custom", label: "Custom" },
];

function tmrDate() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function ScheduleTaskDialog({
  open,
  onOpenChange,
  onSchedule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSchedule: (timestamp: number) => void;
}) {
  const [selectedOption, setSelectedOption] = useState("tomorrow");
  const [customDate, setCustomDate] = useState(() => {
    return formatLocalDate(tmrDate());
  });
  const [customTime, setCustomTime] = useState("09:00");

  const calculateScheduledTime = useCallback(() => {
    const now = new Date();
    if (selectedOption === "custom") {
      if (!customDate) {
        // If no date is selected, default to tomorrow
        const tomorrow = tmrDate();
        const [hours, minutes] = customTime.split(":").map(Number);
        tomorrow.setHours(hours || 9, minutes || 0, 0, 0);
        return tomorrow;
      }
      const [year, month, day] = customDate.split("-").map(Number);
      const [hours, minutes] = customTime.split(":").map(Number);
      return new Date(year!, month! - 1, day!, hours!, minutes!);
    }
    switch (selectedOption) {
      case "15min":
        return new Date(now.getTime() + 15 * 60 * 1000);
      case "30min":
        return new Date(now.getTime() + 30 * 60 * 1000);
      case "1hour":
        return new Date(now.getTime() + 60 * 60 * 1000);
      case "2hours":
        return new Date(now.getTime() + 2 * 60 * 60 * 1000);
      case "4hours":
        return new Date(now.getTime() + 4 * 60 * 60 * 1000);
      case "tomorrow":
        return tmrDate();
      default:
        return new Date(now.getTime() + 60 * 60 * 1000);
    }
  }, [selectedOption, customDate, customTime]);

  const handleSchedule = () => {
    const scheduledTime = calculateScheduledTime();
    onSchedule(scheduledTime.getTime());
    onOpenChange(false);
  };

  const scheduledTime = calculateScheduledTime();
  const isValidSchedule = scheduledTime > new Date();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Schedule Task</DialogTitle>
          <DialogDescription>When should this task run?</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Select value={selectedOption} onValueChange={setSelectedOption}>
            <SelectTrigger>
              <SelectValue placeholder="Select when to run" />
            </SelectTrigger>
            <SelectContent>
              {RELATIVE_TIMES.map((time) => (
                <SelectItem key={time.value} value={time.value}>
                  {time.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedOption === "custom" && (
            <div className="flex gap-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  Date
                </label>
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  min={formatLocalDate(new Date())}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Time
                </label>
                <input
                  type="time"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>
          )}

          {isValidSchedule && (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Runs{" "}
              {scheduledTime.toLocaleString(undefined, {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </div>
          )}

          {!isValidSchedule && selectedOption === "custom" && (
            <p className="text-xs text-destructive">
              Please select a future time
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSchedule}
            disabled={!isValidSchedule}
          >
            Schedule
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
