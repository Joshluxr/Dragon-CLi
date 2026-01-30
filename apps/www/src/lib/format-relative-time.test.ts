import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { formatRelativeTime } from "./format-relative-time";

describe("formatRelativeTime", () => {
  beforeEach(() => {
    // Mock current date to ensure consistent tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Now", () => {
    it('should return "now" for dates less than 30 seconds ago', () => {
      expect(formatRelativeTime(new Date("2024-01-01T11:59:31Z"))).toBe("now");
      expect(formatRelativeTime(new Date("2024-01-01T11:59:45Z"))).toBe("now");
      expect(formatRelativeTime(new Date("2024-01-01T11:59:59Z"))).toBe("now");
      expect(formatRelativeTime(new Date("2024-01-01T12:00:00Z"))).toBe("now");
    });

    it('should return "now" for dates less than 30 seconds in the future', () => {
      expect(formatRelativeTime(new Date("2024-01-01T12:00:15Z"))).toBe("now");
      expect(formatRelativeTime(new Date("2024-01-01T12:00:29Z"))).toBe("now");
    });

    it('should not return "now" for dates exactly 30 seconds ago', () => {
      expect(formatRelativeTime(new Date("2024-01-01T11:59:30Z"))).toBe(
        "1 min ago",
      );
    });
  });

  describe("Minutes", () => {
    it("should return minutes ago for past times less than 1 hour", () => {
      expect(formatRelativeTime(new Date("2024-01-01T11:59:30Z"))).toBe(
        "1 min ago",
      );
      expect(formatRelativeTime(new Date("2024-01-01T11:58:00Z"))).toBe(
        "2 min ago",
      );
      expect(formatRelativeTime(new Date("2024-01-01T11:30:00Z"))).toBe(
        "30 min ago",
      );
      expect(formatRelativeTime(new Date("2024-01-01T11:01:00Z"))).toBe(
        "59 min ago",
      );
    });

    it("should return minutes for future times less than 1 hour", () => {
      expect(formatRelativeTime(new Date("2024-01-01T12:00:30Z"))).toBe(
        "in 1 min",
      );
      expect(formatRelativeTime(new Date("2024-01-01T12:05:00Z"))).toBe(
        "in 5 min",
      );
      expect(formatRelativeTime(new Date("2024-01-01T12:30:00Z"))).toBe(
        "in 30 min",
      );
    });
  });

  describe("Hours", () => {
    it("should return hours ago for past times less than 24 hours", () => {
      expect(formatRelativeTime(new Date("2024-01-01T11:00:00Z"))).toBe(
        "1 hr ago",
      );
      expect(formatRelativeTime(new Date("2024-01-01T10:00:00Z"))).toBe(
        "2 hr ago",
      );
      expect(formatRelativeTime(new Date("2024-01-01T00:00:00Z"))).toBe(
        "12 hr ago",
      );
      expect(formatRelativeTime(new Date("2023-12-31T13:00:00Z"))).toBe(
        "23 hr ago",
      );
    });

    it("should return hours for future times less than 24 hours", () => {
      expect(formatRelativeTime(new Date("2024-01-01T13:00:00Z"))).toBe(
        "in 1 hr",
      );
      expect(formatRelativeTime(new Date("2024-01-01T20:00:00Z"))).toBe(
        "in 8 hr",
      );
      expect(formatRelativeTime(new Date("2024-01-02T09:00:00Z"))).toBe(
        "in 21 hr",
      );
    });
  });

  describe("Days", () => {
    it("should return days ago for past times less than 30 days", () => {
      expect(formatRelativeTime(new Date("2023-12-31T12:00:00Z"))).toBe(
        "1 day ago",
      );
      expect(formatRelativeTime(new Date("2023-12-30T12:00:00Z"))).toBe(
        "2 days ago",
      );
      expect(formatRelativeTime(new Date("2023-12-15T12:00:00Z"))).toBe(
        "17 days ago",
      );
      expect(formatRelativeTime(new Date("2023-12-03T12:00:00Z"))).toBe(
        "29 days ago",
      );
    });

    it("should return days for future times less than 30 days", () => {
      expect(formatRelativeTime(new Date("2024-01-02T12:00:00Z"))).toBe(
        "in 1 day",
      );
      expect(formatRelativeTime(new Date("2024-01-05T12:00:00Z"))).toBe(
        "in 4 days",
      );
      expect(formatRelativeTime(new Date("2024-01-20T12:00:00Z"))).toBe(
        "in 19 days",
      );
    });
  });

  describe("Months", () => {
    it("should return months ago for past times less than 12 months", () => {
      expect(formatRelativeTime(new Date("2023-12-02T12:00:00Z"))).toBe(
        "1 mo ago",
      );
      expect(formatRelativeTime(new Date("2023-11-01T12:00:00Z"))).toBe(
        "2 mo ago",
      );
      expect(formatRelativeTime(new Date("2023-07-01T12:00:00Z"))).toBe(
        "6 mo ago",
      );
      expect(formatRelativeTime(new Date("2023-01-15T12:00:00Z"))).toBe(
        "11 mo ago",
      );
    });
  });

  describe("Years", () => {
    it("should return years ago for past times 12 months or more", () => {
      expect(formatRelativeTime(new Date("2023-01-01T12:00:00Z"))).toBe(
        "1 yr ago",
      );
      expect(formatRelativeTime(new Date("2022-01-01T12:00:00Z"))).toBe(
        "2 yr ago",
      );
      expect(formatRelativeTime(new Date("2021-01-01T12:00:00Z"))).toBe(
        "3 yr ago",
      );
      expect(formatRelativeTime(new Date("2014-01-01T12:00:00Z"))).toBe(
        "10 yr ago",
      );
    });
  });

  describe("Edge cases", () => {
    it("should handle string dates", () => {
      expect(formatRelativeTime("2024-01-01T11:59:45Z")).toBe("now");
      expect(formatRelativeTime("2024-01-01T11:00:00Z")).toBe("1 hr ago");
      expect(formatRelativeTime("2023-01-01T12:00:00Z")).toBe("1 yr ago");
    });

    it("should handle exact boundaries", () => {
      // Exactly 1 minute (60 seconds)
      expect(formatRelativeTime(new Date("2024-01-01T11:59:00Z"))).toBe(
        "1 min ago",
      );

      // Exactly 1 hour (60 minutes)
      expect(formatRelativeTime(new Date("2024-01-01T11:00:00Z"))).toBe(
        "1 hr ago",
      );

      // Exactly 1 day (24 hours)
      expect(formatRelativeTime(new Date("2023-12-31T12:00:00Z"))).toBe(
        "1 day ago",
      );

      // Exactly 30 days
      expect(formatRelativeTime(new Date("2023-12-02T12:00:00Z"))).toBe(
        "1 mo ago",
      );

      // Exactly 12 months (360 days)
      expect(formatRelativeTime(new Date("2023-01-06T12:00:00Z"))).toBe(
        "1 yr ago",
      );
    });
  });
});
