import { describe, expect, it } from "vitest";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/relativeTime";

const NOW = new Date("2026-11-18T12:00:00Z");
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000);
const MIN = 60;
const HOUR = 3600;
const DAY = 86400;

describe("formatRelativeTime", () => {
  it.each<[string, number, string]>([
    ["just now (0s)", 0, "just now"],
    ["just now (44s)", 44, "just now"],
    ["45s rounds up to a minute", 45, "1 minute ago"],
    ["5 minutes", 5 * MIN, "5 minutes ago"],
    ["44 minutes", 44 * MIN, "44 minutes ago"],
    ["45 minutes becomes an hour", 45 * MIN, "1 hour ago"],
    ["90 minutes is 2 hours", 90 * MIN, "2 hours ago"],
    ["3 hours", 3 * HOUR, "3 hours ago"],
    ["21 hours", 21 * HOUR, "21 hours ago"],
    ["22 hours becomes a day", 22 * HOUR, "yesterday"],
    ["30 hours", 30 * HOUR, "yesterday"],
    ["3 days", 3 * DAY, "3 days ago"],
    ["6 days", 6 * DAY, "6 days ago"],
    ["7 days", 7 * DAY, "last week"],
    ["14 days", 14 * DAY, "2 weeks ago"],
    ["29 days", 29 * DAY, "4 weeks ago"],
    ["30 days falls back to a date", 30 * DAY, "Oct 19, 2026"],
    ["a year ago", 365 * DAY, "Nov 18, 2025"],
  ])("%s", (_name, seconds, expected) => {
    expect(formatRelativeTime(ago(seconds), NOW)).toBe(expected);
  });

  it("accepts ISO strings and timestamps", () => {
    expect(formatRelativeTime("2026-11-18T11:55:00Z", NOW)).toBe("5 minutes ago");
    expect(formatRelativeTime(NOW.getTime() - 2 * HOUR * 1000, NOW.getTime())).toBe("2 hours ago");
  });

  it("treats small clock skew into the future as 'just now'", () => {
    expect(formatRelativeTime(new Date(NOW.getTime() + 20_000), NOW)).toBe("just now");
  });

  it("describes larger future times instead of lying", () => {
    expect(formatRelativeTime(new Date(NOW.getTime() + 5 * MIN * 1000), NOW)).toBe("in 5 minutes");
  });

  it("returns an empty string for an invalid date", () => {
    expect(formatRelativeTime("not a date", NOW)).toBe("");
  });
});

describe("formatAbsoluteTime", () => {
  it("formats in UTC so server and client agree", () => {
    expect(formatAbsoluteTime("2026-11-18T14:07:00Z")).toBe("Nov 18, 2026, 2:07 PM UTC");
  });

  it("returns an empty string for an invalid date", () => {
    expect(formatAbsoluteTime("nope")).toBe("");
  });
});
