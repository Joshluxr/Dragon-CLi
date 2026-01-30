import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  type ValidateCronExpressionOptions,
  parseCronToState,
  generateCron,
  isValidCronExpression,
  getCronDescription,
  getNextRunTime,
  isSupportedCronExpression,
} from "./cron";

describe("parseCronToState", () => {
  it("should parse daily cron expressions correctly", () => {
    const result = parseCronToState("0 9 * * *");
    expect(result).toEqual({
      frequency: "daily",
      hour: "9:00",
    });
  });

  it("should parse daily cron with 30-minute intervals", () => {
    const result = parseCronToState("30 14 * * *");
    expect(result).toEqual({
      frequency: "daily",
      hour: "14:30",
    });
  });

  it("should parse weekly cron expressions correctly", () => {
    const result = parseCronToState("0 10 * * 1");
    expect(result).toEqual({
      frequency: "weekly",
      hour: "10:00",
      dayOfWeek: "1",
    });
  });

  it("should parse weekly Sunday cron expressions", () => {
    const result = parseCronToState("0 22 * * 0");
    expect(result).toEqual({
      frequency: "weekly",
      hour: "22:00",
      dayOfWeek: "0",
    });
  });

  it("should parse monthly cron expressions correctly", () => {
    const result = parseCronToState("0 15 15 * *");
    expect(result).toEqual({
      frequency: "monthly",
      hour: "15:00",
      dayOfMonth: "15",
    });
  });

  it("should parse weekdays cron expressions correctly", () => {
    const result = parseCronToState("0 8 * * 1-5");
    expect(result).toEqual({
      frequency: "weekdays",
      hour: "8:00",
      selectedDays: ["1", "2", "3", "4", "5"],
    });
  });

  it("should parse custom weekly cron expressions correctly", () => {
    const result = parseCronToState("30 7 * * 1,3,5");
    expect(result).toEqual({
      frequency: "custom-weekly",
      hour: "7:30",
      selectedDays: ["1", "3", "5"],
    });
  });

  it("should handle missing parts gracefully", () => {
    const result = parseCronToState("* * * *");
    expect(result).toEqual({
      frequency: "daily",
      hour: "9:00",
    });
  });

  it("should handle empty string", () => {
    const result = parseCronToState("");
    expect(result).toEqual({
      frequency: "daily",
      hour: "9:00",
    });
  });

  it("should pad minutes correctly", () => {
    const result = parseCronToState("5 12 * * *");
    expect(result).toEqual({
      frequency: "daily",
      hour: "12:05",
    });
  });
});

describe("generateCron", () => {
  it("should generate daily cron expressions correctly", () => {
    const cron = generateCron("daily", "9:00");
    expect(cron).toBe("0 9 * * *");
  });

  it("should generate daily cron with 30-minute intervals", () => {
    const cron = generateCron("daily", "14:30");
    expect(cron).toBe("30 14 * * *");
  });

  it("should generate weekly cron expressions correctly", () => {
    const cron = generateCron("weekly", "10:00", "1");
    expect(cron).toBe("0 10 * * 1");
  });

  it("should generate weekly Sunday cron expressions", () => {
    const cron = generateCron("weekly", "22:00", "0");
    expect(cron).toBe("0 22 * * 0");
  });

  it("should generate monthly cron expressions correctly", () => {
    const cron = generateCron("monthly", "15:00", undefined, "15");
    expect(cron).toBe("0 15 15 * *");
  });

  it("should generate weekdays cron expressions correctly", () => {
    const cron = generateCron("weekdays", "8:00");
    expect(cron).toBe("0 8 * * 1-5");
  });

  it("should generate custom weekly cron expressions correctly", () => {
    const cron = generateCron("custom-weekly", "7:30", undefined, undefined, [
      "1",
      "3",
      "5",
    ]);
    expect(cron).toBe("30 7 * * 1,3,5");
  });

  it("should handle missing hour parameter", () => {
    const cron = generateCron("daily", "");
    expect(cron).toBe("0 9 * * *");
  });

  it("should handle missing minute in hour parameter", () => {
    const cron = generateCron("daily", "14");
    expect(cron).toBe("0 14 * * *");
  });

  it("should use default values for optional parameters", () => {
    const cron = generateCron("weekly", "10:00");
    expect(cron).toBe("0 10 * * 1");
  });

  it("should use default values for monthly", () => {
    const cron = generateCron("monthly", "10:00");
    expect(cron).toBe("0 10 1 * *");
  });

  it("should use default values for custom-weekly", () => {
    const cron = generateCron("custom-weekly", "10:00");
    expect(cron).toBe("0 10 * * 1");
  });

  it("should handle unknown frequency types", () => {
    const cron = generateCron("unknown" as any, "10:00");
    expect(cron).toBe("0 10 * * *");
  });

  it("should generate multi-hour daily cron expressions correctly", () => {
    const cron = generateCron(
      "daily",
      "9:00",
      undefined,
      undefined,
      undefined,
      ["9:00", "12:00", "15:00"],
    );
    expect(cron).toBe("0 9,12,15 * * *");
  });

  it("should generate multi-hour weekly cron expressions correctly", () => {
    const cron = generateCron("weekly", "8:00", "1", undefined, undefined, [
      "8:00",
      "13:00",
      "18:00",
    ]);
    expect(cron).toBe("0 8,13,18 * * 1");
  });

  it("should generate multi-hour custom weekly cron expressions correctly", () => {
    const cron = generateCron(
      "custom-weekly",
      "9:30",
      undefined,
      undefined,
      ["1", "3", "5"],
      ["9:30", "14:30", "19:30"],
    );
    expect(cron).toBe("30 9,14,19 * * 1,3,5");
  });

  it("should use minutes from selectedHours array when provided", () => {
    // Test that changing minutes in multi-hour mode works correctly
    const cron = generateCron(
      "daily",
      "9:00",
      undefined,
      undefined,
      undefined,
      ["9:15", "12:15", "15:15"],
    );
    expect(cron).toBe("15 9,12,15 * * *");
  });

  it("should prioritize selectedHours minutes over hour parameter minutes", () => {
    // When selectedHours is provided, its minutes should be used, not the hour param's minutes
    const cron = generateCron(
      "daily",
      "9:00", // hour param has :00 minutes
      undefined,
      undefined,
      undefined,
      ["9:45", "12:45", "15:45"], // but selectedHours has :45 minutes
    );
    expect(cron).toBe("45 9,12,15 * * *");
  });
});

describe("parseCronToState and generateCron round-trip", () => {
  it("should round-trip daily schedules", () => {
    const originalCron = "0 9 * * *";
    const state = parseCronToState(originalCron);
    const generatedCron = generateCron(
      state.frequency,
      state.hour,
      state.dayOfWeek,
      state.dayOfMonth,
      state.selectedDays,
    );
    expect(generatedCron).toBe(originalCron);
  });

  it("should round-trip weekly schedules", () => {
    const originalCron = "30 15 * * 3";
    const state = parseCronToState(originalCron);
    const generatedCron = generateCron(
      state.frequency,
      state.hour,
      state.dayOfWeek,
      state.dayOfMonth,
      state.selectedDays,
    );
    expect(generatedCron).toBe(originalCron);
  });

  it("should round-trip monthly schedules", () => {
    const originalCron = "45 22 28 * *";
    const state = parseCronToState(originalCron);
    const generatedCron = generateCron(
      state.frequency,
      state.hour,
      state.dayOfWeek,
      state.dayOfMonth,
      state.selectedDays,
    );
    expect(generatedCron).toBe(originalCron);
  });

  it("should round-trip weekdays schedules", () => {
    const originalCron = "0 8 * * 1-5";
    const state = parseCronToState(originalCron);
    const generatedCron = generateCron(
      state.frequency,
      state.hour,
      state.dayOfWeek,
      state.dayOfMonth,
      state.selectedDays,
    );
    expect(generatedCron).toBe(originalCron);
  });

  it("should round-trip custom weekly schedules", () => {
    const originalCron = "15 12 * * 2,4,6";
    const state = parseCronToState(originalCron);
    const generatedCron = generateCron(
      state.frequency,
      state.hour,
      state.dayOfWeek,
      state.dayOfMonth,
      state.selectedDays,
    );
    expect(generatedCron).toBe(originalCron);
  });

  it("should round-trip multi-hour daily schedules", () => {
    const originalCron = "0 9,12,15 * * *";
    const state = parseCronToState(originalCron);
    const generatedCron = generateCron(
      state.frequency,
      state.hour,
      state.dayOfWeek,
      state.dayOfMonth,
      state.selectedDays,
      state.selectedHours,
    );
    expect(generatedCron).toBe(originalCron);
  });

  it("should round-trip multi-hour weekly schedules", () => {
    const originalCron = "30 8,13,18 * * 3";
    const state = parseCronToState(originalCron);
    const generatedCron = generateCron(
      state.frequency,
      state.hour,
      state.dayOfWeek,
      state.dayOfMonth,
      state.selectedDays,
      state.selectedHours,
    );
    expect(generatedCron).toBe(originalCron);
  });
});

describe("edge cases and error handling", () => {
  it("should handle cron expressions with all wildcards", () => {
    const result = parseCronToState("* * * * *");
    expect(result.frequency).toBe("daily");
  });

  it("should handle malformed cron expressions gracefully", () => {
    const result = parseCronToState("invalid cron");
    expect(result).toEqual({
      frequency: "daily",
      hour: "9:00",
    });
  });

  it("should handle cron with too few parts", () => {
    const result = parseCronToState("0 9");
    expect(result).toEqual({
      frequency: "daily",
      hour: "9:00",
    });
  });

  it("should handle custom weekly with single day", () => {
    const result = parseCronToState("0 10 * * 3");
    expect(result).toEqual({
      frequency: "weekly",
      hour: "10:00",
      dayOfWeek: "3",
    });
  });

  it("should handle custom weekly with all days", () => {
    const result = parseCronToState("0 10 * * 0,1,2,3,4,5,6");
    expect(result).toEqual({
      frequency: "custom-weekly",
      hour: "10:00",
      selectedDays: ["0", "1", "2", "3", "4", "5", "6"],
    });
  });

  it("should handle conflicting day specifications", () => {
    // When both dayOfMonth and dayOfWeek are set, we default to daily
    const result = parseCronToState("0 10 15 * 1");
    expect(result).toEqual({
      frequency: "daily",
      hour: "9:00",
    });
  });

  it("should handle hours with leading zeros", () => {
    const result = parseCronToState("0 09 * * *");
    expect(result).toEqual({
      frequency: "daily",
      hour: "09:00",
    });
  });

  it("should handle minutes with leading zeros", () => {
    const result = parseCronToState("05 9 * * *");
    expect(result).toEqual({
      frequency: "daily",
      hour: "9:05",
    });
  });

  it("should parse multi-hour daily cron expressions correctly", () => {
    const result = parseCronToState("0 9,12,15 * * *");
    expect(result).toEqual({
      frequency: "daily",
      hour: "9:00",
      selectedHours: ["9:00", "12:00", "15:00"],
    });
  });

  it("should parse multi-hour weekly cron expressions correctly", () => {
    const result = parseCronToState("0 8,13,18 * * 1");
    expect(result).toEqual({
      frequency: "weekly",
      hour: "8:00",
      dayOfWeek: "1",
      selectedHours: ["8:00", "13:00", "18:00"],
    });
  });

  it("should parse multi-hour custom weekly cron expressions correctly", () => {
    const result = parseCronToState("30 9,14,19 * * 1,3,5");
    expect(result).toEqual({
      frequency: "custom-weekly",
      hour: "9:30",
      selectedDays: ["1", "3", "5"],
      selectedHours: ["9:30", "14:30", "19:30"],
    });
  });
});

describe("isValidCronExpression", () => {
  it("should validate correct cron expressions", () => {
    expect(isValidCronExpression("0 9 * * *")).toBe(true);
    expect(isValidCronExpression("*/5 * * * *")).toBe(true);
    expect(isValidCronExpression("0 0 1 * *")).toBe(true);
    expect(isValidCronExpression("0 0 * * 0")).toBe(true);
    expect(isValidCronExpression("0 0 * * 1-5")).toBe(true);
  });

  it("should reject invalid cron expressions", () => {
    expect(isValidCronExpression("invalid")).toBe(false);
    expect(isValidCronExpression("")).toBe(false);
    expect(isValidCronExpression("* * * *")).toBe(false);
    expect(isValidCronExpression("60 * * * *")).toBe(false);
    expect(isValidCronExpression("* 24 * * *")).toBe(false);
  });
});

describe("isSupportedCronExpression", () => {
  describe("should accept supported patterns", () => {
    it("accepts daily patterns", () => {
      expect(isSupportedCronExpression("0 9 * * *")).toBe(true);
      expect(isSupportedCronExpression("30 14 * * *")).toBe(true);
      expect(isSupportedCronExpression("45 23 * * *")).toBe(true);
    });

    it("accepts weekly patterns", () => {
      expect(isSupportedCronExpression("0 9 * * 1")).toBe(true);
      expect(isSupportedCronExpression("30 14 * * 0")).toBe(true);
      expect(isSupportedCronExpression("0 0 * * 6")).toBe(true);
    });

    it("accepts weekdays pattern", () => {
      expect(isSupportedCronExpression("0 9 * * 1-5")).toBe(true);
      expect(isSupportedCronExpression("30 8 * * 1-5")).toBe(true);
    });

    it("accepts custom weekly patterns", () => {
      expect(isSupportedCronExpression("0 9 * * 1,3,5")).toBe(true);
      expect(isSupportedCronExpression("0 9 * * 0,6")).toBe(true);
      expect(isSupportedCronExpression("0 9 * * 1,2,3,4,5")).toBe(true);
    });

    it("accepts monthly patterns", () => {
      expect(isSupportedCronExpression("0 9 1 * *")).toBe(true);
      expect(isSupportedCronExpression("0 9 15 * *")).toBe(true);
      expect(isSupportedCronExpression("0 9 28 * *")).toBe(true);
    });

    it("accepts multi-hour daily patterns", () => {
      expect(isSupportedCronExpression("0 9,12,15 * * *")).toBe(true);
      expect(isSupportedCronExpression("30 8,13,18 * * *")).toBe(true);
      expect(isSupportedCronExpression("0 0,6,12,18 * * *")).toBe(true);
    });

    it("accepts multi-hour weekly patterns", () => {
      expect(isSupportedCronExpression("0 9,12,15 * * 1")).toBe(true);
      expect(isSupportedCronExpression("30 8,13,18 * * 0")).toBe(true);
    });

    it("accepts multi-hour custom weekly patterns", () => {
      expect(isSupportedCronExpression("0 9,12,15 * * 1,3,5")).toBe(true);
      expect(isSupportedCronExpression("0 8,17 * * 1-5")).toBe(true);
    });

    it("accepts up to 8 hours", () => {
      expect(isSupportedCronExpression("0 9,10,11,12,13,14,15,16 * * *")).toBe(
        true,
      );
      expect(isSupportedCronExpression("0 0,6,12,18,23 * * *")).toBe(true);
    });

    it("rejects more than 8 hours", () => {
      expect(
        isSupportedCronExpression("0 9,10,11,12,13,14,15,16,17 * * *"),
      ).toBe(false);
      expect(isSupportedCronExpression("0 0,3,6,9,12,15,18,21,24 * * *")).toBe(
        false,
      );
    });

    it("rejects duplicate hours", () => {
      expect(isSupportedCronExpression("0 9,9,12 * * *")).toBe(false);
      expect(isSupportedCronExpression("0 10,12,10 * * *")).toBe(false);
    });
  });

  describe("should reject unsupported patterns", () => {
    it("rejects patterns with seconds", () => {
      expect(isSupportedCronExpression("0 0 9 * * *")).toBe(false);
    });

    it("rejects patterns with special characters in minutes/hours", () => {
      expect(isSupportedCronExpression("*/5 * * * *")).toBe(true); // This is now supported for 5-minutely
      expect(isSupportedCronExpression("0-30 9 * * *")).toBe(false);
      expect(isSupportedCronExpression("* * * * *")).toBe(false);
    });

    it("rejects patterns with month specifications", () => {
      expect(isSupportedCronExpression("0 9 * 1 *")).toBe(false);
      expect(isSupportedCronExpression("0 9 * 1-3 *")).toBe(false);
      expect(isSupportedCronExpression("0 9 * JAN *")).toBe(false);
    });

    it("rejects patterns with both day fields set", () => {
      expect(isSupportedCronExpression("0 9 15 * 1")).toBe(false);
    });

    it("rejects day of month > 28", () => {
      expect(isSupportedCronExpression("0 9 29 * *")).toBe(false);
      expect(isSupportedCronExpression("0 9 30 * *")).toBe(false);
      expect(isSupportedCronExpression("0 9 31 * *")).toBe(false);
    });

    it("rejects invalid day of week values", () => {
      expect(isSupportedCronExpression("0 9 * * 7")).toBe(false);
      expect(isSupportedCronExpression("0 9 * * 1-6")).toBe(false);
      expect(isSupportedCronExpression("0 9 * * MON")).toBe(false);
    });

    it("rejects complex patterns", () => {
      expect(isSupportedCronExpression("0 9 */2 * *")).toBe(false);
      expect(isSupportedCronExpression("0 9 L * *")).toBe(false);
      expect(isSupportedCronExpression("0 9 * * 1#2")).toBe(false);
    });

    it("rejects invalid cron expressions", () => {
      expect(isSupportedCronExpression("invalid")).toBe(false);
      expect(isSupportedCronExpression("")).toBe(false);
      expect(isSupportedCronExpression("0 9 * *")).toBe(false);
    });
  });
});

describe("getCronDescription", () => {
  it("should return human-readable descriptions", () => {
    expect(getCronDescription("0 9 * * *")).toContain("9:00 AM");
    expect(getCronDescription("0 0 * * 0")).toContain("Sunday");
    expect(getCronDescription("0 0 1 * *")).toContain("day 1 of the month");
    expect(getCronDescription("*/5 * * * *")).toContain("5 minutes");
  });

  it("should include timezone if provided", () => {
    const desc = getCronDescription("0 9 * * *", "America/New_York");
    expect(desc).toContain("America/New_York");
  });

  it("should handle invalid expressions gracefully", () => {
    expect(getCronDescription("invalid")).toBe("Invalid cron expression");
  });
});

describe("getNextRunTime", () => {
  const options: ValidateCronExpressionOptions = { accessTier: "core" };
  it("should calculate next run time", () => {
    const nextRun = getNextRunTime({ cron: "0 9 * * *", options });
    expect(nextRun).toBeInstanceOf(Date);
    expect(nextRun?.getHours()).toBe(9);
    expect(nextRun?.getMinutes()).toBe(0);
  });

  it("should respect timezone", () => {
    const nextRun = getNextRunTime({
      cron: "0 9 * * *",
      timezone: "UTC",
      options,
    });
    expect(nextRun).toBeInstanceOf(Date);
    expect(nextRun?.getUTCHours()).toBe(9);
  });

  it("should return null for invalid expressions", () => {
    expect(getNextRunTime({ cron: "invalid", options })).toBeNull();
  });

  beforeEach(() => {
    // Mock the current date to ensure consistent test results
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should calculate next run time for daily cron", () => {
    const nextRun = getNextRunTime({
      cron: "0 9 * * *",
      timezone: "UTC",
      options,
    });
    expect(nextRun).toEqual(new Date("2024-01-16T09:00:00.000Z"));
  });

  it("should calculate next run time for daily cron in different timezone", () => {
    const nextRun = getNextRunTime({
      cron: "0 9 * * *",
      timezone: "America/New_York",
      options,
    });
    // 9 AM EST = 2 PM UTC
    expect(nextRun).toEqual(new Date("2024-01-15T14:00:00.000Z"));
  });

  it("should calculate next run time after a specific date", () => {
    const afterDate = new Date("2024-01-20T15:00:00.000Z");
    const nextRun = getNextRunTime({
      cron: "0 9 * * *",
      timezone: "UTC",
      afterDate,
      options,
    });
    expect(nextRun).toEqual(new Date("2024-01-21T09:00:00.000Z"));
  });

  it("should calculate next run time for weekly cron", () => {
    // Monday at 9 AM
    const nextRun = getNextRunTime({
      cron: "0 9 * * 1",
      timezone: "UTC",
      options,
    });
    // Next Monday is January 22, 2024
    expect(nextRun).toEqual(new Date("2024-01-22T09:00:00.000Z"));
  });

  it("should calculate next run time for monthly cron", () => {
    // 15th of each month at 9 AM
    const nextRun = getNextRunTime({
      cron: "0 9 15 * *",
      timezone: "UTC",
      options,
    });
    // We're already on the 15th at 10 AM, so next run is February 15
    expect(nextRun).toEqual(new Date("2024-02-15T09:00:00.000Z"));
  });

  it("should calculate next run time for weekdays cron", () => {
    // Monday-Friday at 9 AM
    const nextRun = getNextRunTime({
      cron: "0 9 * * 1-5",
      timezone: "UTC",
      options,
    });
    // January 15, 2024 is a Monday, next run is Tuesday
    expect(nextRun).toEqual(new Date("2024-01-16T09:00:00.000Z"));
  });

  it("should calculate next run time for 5-minutely cron", () => {
    const nextRun = getNextRunTime({
      cron: "*/5 * * * *",
      timezone: "UTC",
      options,
    });
    // Current time is 10:00, next run is 10:05
    expect(nextRun).toEqual(new Date("2024-01-15T10:05:00.000Z"));
  });

  it("should return null for invalid cron expression", () => {
    const nextRun = getNextRunTime({
      cron: "invalid cron",
      timezone: "UTC",
      options,
    });
    expect(nextRun).toBeNull();
  });

  it("should return null for empty cron expression", () => {
    const nextRun = getNextRunTime({
      cron: "",
      timezone: "UTC",
      options: options,
    });
    expect(nextRun).toBeNull();
  });

  it("should handle cron calculation errors gracefully", () => {
    // Test with an invalid timezone
    const nextRun = getNextRunTime({
      cron: "0 9 * * *",
      timezone: "Invalid/Timezone",
      options,
    });
    expect(nextRun).toBeNull();
  });
});
