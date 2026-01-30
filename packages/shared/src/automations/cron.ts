/**
 * Cron expression validation and helper utilities for automation scheduling
 */

import { AccessTier } from "../db/types";
import { CronExpressionParser } from "cron-parser";
import cronstrue from "cronstrue";

export type ScheduleFrequency =
  | "5-minutely" // DEVELOPMENT ONLY
  | "daily"
  | "weekly"
  | "monthly"
  | "weekdays"
  | "custom-weekly";

function getCronParts(cron: string): string[] {
  const parts = cron.trim().split(/\s+/);
  return parts;
}

/**
 * Validates if a cron expression is syntactically correct
 * @param cron The cron expression to validate
 * @returns true if the expression is valid, false otherwise
 */
export function isValidCronExpression(cron: string): boolean {
  try {
    // Ensure we have exactly 5 fields (minute hour dayOfMonth month dayOfWeek)
    const parts = getCronParts(cron);
    if (parts.length !== 5) {
      return false;
    }
    // Use cron-parser for validation
    CronExpressionParser.parse(cron);
    return true;
  } catch {
    return false;
  }
}

// Maximum number of hours specified per schedule automation
export const MAX_HOURS_SCHEDULE_AUTOMATIONS = 8;

/**
 * Validates if a cron expression is both syntactically correct and supported by our system
 * @param cron The cron expression to validate
 * @returns true if the expression is valid and supported, false otherwise
 */
export function isSupportedCronExpression(cron: string): boolean {
  if (!isValidCronExpression(cron)) {
    return false;
  }

  const parts = getCronParts(cron);
  if (parts.length !== 5) {
    return false;
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Month field must always be *
  if (month !== "*") {
    return false;
  }

  // Validate minute (0-59 or valid numbers only, no special characters, or */5 for 5-minutely in dev)
  if (minute === "*/5") {
    // Special case for 5-minutely pattern (development only)
    // Note: The actual NODE_ENV check happens in the UI, this just validates the pattern
  } else if (!minute || !/^([0-5]?\d)$/.test(minute)) {
    return false;
  } else {
    const minuteNum = parseInt(minute, 10);
    if (minuteNum < 0 || minuteNum > 59) {
      return false;
    }
  }

  // Validate hour (0-23 or valid numbers only, no special characters, or * for 5-minutely, or comma-separated hours)
  if (!hour) {
    return false;
  }
  if (hour === "*") {
    // Special case for 5-minutely pattern
  } else {
    // Check for comma-separated hours
    const hourParts = hour.split(",");
    // Limit to MAX_HOURS_SCHEDULE_AUTOMATIONS hours maximum
    if (hourParts.length > MAX_HOURS_SCHEDULE_AUTOMATIONS) {
      return false;
    }
    // Check for duplicates
    const uniqueHours = new Set(hourParts);
    if (uniqueHours.size !== hourParts.length) {
      return false;
    }

    for (const hourPart of hourParts) {
      if (!hourPart || !/^([01]?\d|2[0-3])$/.test(hourPart)) {
        return false;
      }
      const hourNum = parseInt(hourPart, 10);
      if (hourNum < 0 || hourNum > 23) {
        return false;
      }
    }
  }

  // Check supported patterns
  if (dayOfMonth === "*" && dayOfWeek === "*") {
    // Daily pattern: minute hour * * *
    // Also support 5-minutely pattern: */5 * * * *
    if (minute === "*/5" && hour === "*") {
      return true;
    }
    return true;
  }

  if (dayOfMonth === "*" && dayOfWeek !== "*") {
    // Weekly patterns
    if (dayOfWeek === "1-5") {
      // Weekdays pattern: minute hour * * 1-5
      return true;
    }

    // Single day pattern: minute hour * * [0-6]
    if (dayOfWeek && /^[0-6]$/.test(dayOfWeek)) {
      return true;
    }

    // Custom weekly pattern: minute hour * * 0,1,2... (comma-separated days)
    if (dayOfWeek && /^[0-6](,[0-6])*$/.test(dayOfWeek)) {
      return true;
    }

    return false;
  }

  if (dayOfMonth !== "*" && dayOfWeek === "*") {
    // Monthly pattern: minute hour [1-28] * *
    if (!dayOfMonth || !/^([1-9]|1\d|2[0-8])$/.test(dayOfMonth)) {
      return false;
    }
    return true;
  }

  // Any other pattern is not supported
  return false;
}

export type ValidateCronExpressionOptions = {
  accessTier: AccessTier;
};

type UserSpecificCronValidationResult = {
  isValid: boolean;
  error?: "unsupported-pattern" | "pro-only";
};

function userSpecificCronValidation(
  cron: string,
  options: ValidateCronExpressionOptions,
): UserSpecificCronValidationResult {
  const parts = getCronParts(cron);
  const hoursPart = parts[1];
  const hourParts = hoursPart ? hoursPart.split(",") : [];
  if (hourParts.length > 1 && options.accessTier !== "pro") {
    return { isValid: false, error: "pro-only" };
  }
  return { isValid: true };
}

export function validateCronExpression(
  cron: string,
  options: ValidateCronExpressionOptions,
): {
  isValid: boolean;
  error?:
    | "invalid-syntax"
    | "unsupported-pattern"
    | UserSpecificCronValidationResult["error"];
} {
  if (!isValidCronExpression(cron)) {
    return { isValid: false, error: "invalid-syntax" };
  }
  if (!isSupportedCronExpression(cron)) {
    return { isValid: false, error: "unsupported-pattern" };
  }
  const userSpecificValidationResult = userSpecificCronValidation(
    cron,
    options,
  );
  if (!userSpecificValidationResult.isValid) {
    return { isValid: false, error: userSpecificValidationResult.error };
  }
  return { isValid: true };
}

/**
 * Parse a cron expression into UI state
 */
export function parseCronToState(cron: string): {
  frequency: ScheduleFrequency;
  hour: string;
  dayOfWeek?: string;
  dayOfMonth?: string;
  selectedDays?: string[];
  selectedHours?: string[];
} {
  const parts = cron.split(" ");
  if (parts.length < 5) {
    // Handle malformed cron
    return { frequency: "daily", hour: "9:00" };
  }
  const [minutePart, hourPart, dayOfMonthPart, , dayOfWeekPart] = parts;

  const minute = minutePart === "*" ? "0" : minutePart || "0";
  const hourNum = hourPart === "*" ? "9" : hourPart || "9";

  // Check if hour is comma-separated (multi-hour)
  const hours = hourNum.split(",");
  const selectedHours =
    hours.length > 1
      ? hours.map((h) => `${h}:${minute.padStart(2, "0")}`)
      : undefined;
  const hour = `${hours[0]}:${minute.padStart(2, "0")}`;

  const dayOfMonth = dayOfMonthPart || "*";
  const dayOfWeek = dayOfWeekPart || "*";

  if (dayOfMonth === "*" && dayOfWeek === "*") {
    // Check for 5-minutely pattern (only in development)
    if (
      minutePart === "*/5" &&
      hourPart === "*" &&
      process.env.NODE_ENV === "development"
    ) {
      return { frequency: "5-minutely", hour: "0:00" };
    }
    return { frequency: "daily", hour, selectedHours };
  }

  if (dayOfMonth === "*" && dayOfWeek !== "*") {
    if (dayOfWeek === "1-5") {
      return {
        frequency: "weekdays",
        hour,
        selectedHours,
        selectedDays: ["1", "2", "3", "4", "5"],
      };
    }
    const days = dayOfWeek.split(",");
    if (days.length === 1) {
      return { frequency: "weekly", hour, selectedHours, dayOfWeek };
    } else {
      return {
        frequency: "custom-weekly",
        hour,
        selectedHours,
        selectedDays: days,
      };
    }
  }

  if (dayOfMonth !== "*" && dayOfWeek === "*") {
    return { frequency: "monthly", hour, selectedHours, dayOfMonth };
  }

  return { frequency: "daily", hour: "9:00" };
}

/**
 * Generate a cron expression from UI state
 */
export function generateCron(
  frequency: ScheduleFrequency,
  hour: string,
  dayOfWeek?: string,
  dayOfMonth?: string,
  selectedDays?: string[],
  selectedHours?: string[],
): string {
  const [h, m] = (hour || "9:00").split(":");

  // If multiple hours are selected, extract minute from first selectedHour, otherwise use hour param
  const minute =
    selectedHours && selectedHours.length > 0
      ? parseInt(selectedHours[0]?.split(":")[1] || "0", 10).toString()
      : parseInt(m || "0", 10).toString(); // Convert to number and back to remove leading zeros

  // If multiple hours are selected, generate comma-separated hour list
  const hourPart =
    selectedHours && selectedHours.length > 0
      ? selectedHours
          .map((timeStr) => {
            const [hour] = timeStr.split(":");
            return parseInt(hour || "0", 10).toString();
          })
          .join(",")
      : h;

  switch (frequency) {
    case "5-minutely":
      if (process.env.NODE_ENV === "development") {
        return `*/5 * * * *`;
      }
    // Fall through to daily if not in development
    case "daily":
      return `${minute} ${hourPart} * * *`;
    case "weekly":
      return `${minute} ${hourPart} * * ${dayOfWeek || "1"}`;
    case "monthly":
      return `${minute} ${hourPart} ${dayOfMonth || "1"} * *`;
    case "weekdays":
      return `${minute} ${hourPart} * * 1-5`;
    case "custom-weekly":
      return `${minute} ${hourPart} * * ${selectedDays?.join(",") || "1"}`;
    default:
      return `${minute} ${hourPart} * * *`;
  }
}

/**
 * Get a human-readable description of a cron expression
 * @param cron The cron expression to describe
 * @param timezone Optional timezone to include in the description
 * @returns A human-readable description of the cron expression
 */
export function getCronDescription(cron: string, timezone?: string): string {
  try {
    if (!isValidCronExpression(cron)) {
      return "Invalid cron expression";
    }
    const description = cronstrue.toString(cron, {
      throwExceptionOnParseError: true,
      verbose: false,
    });
    return timezone ? `${description} (${timezone})` : description;
  } catch {
    return "Invalid cron expression";
  }
}

/**
 * Convert a cron expression to a human readable description
 * @param cron The cron expression
 * @returns A human-readable description
 */
export function cronToHumanReadable(cron: string): string {
  try {
    if (!isValidCronExpression(cron)) {
      return "Invalid cron expression";
    }
    const description = cronstrue.toString(cron, {
      throwExceptionOnParseError: true,
      verbose: true,
    });
    return description;
  } catch {
    return "Invalid cron expression";
  }
}

/**
 * Calculate the next run time for a cron expression
 * @returns The next run time as a Date, or null if invalid
 */
export function getNextRunTime({
  cron,
  timezone,
  afterDate,
  options,
}: {
  cron: string;
  timezone?: string;
  afterDate?: Date;
  options: ValidateCronExpressionOptions;
}): Date | null {
  try {
    const { isValid } = validateCronExpression(cron, options);
    if (!isValid) {
      return null;
    }
    const interval = CronExpressionParser.parse(cron, {
      tz: timezone,
      currentDate: afterDate || new Date(),
    });
    return interval.next().toDate();
  } catch (error) {
    console.error("Error calculating next run time:", error);
    return null;
  }
}
