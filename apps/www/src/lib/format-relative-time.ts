/**
 * Formats a date as relative time from now in abbreviated format
 * @param date - The date to format
 * @returns Formatted string like "now", "5 min ago", "3 hr ago", "2 days ago", "1 mo ago", "3 yr ago"
 */
export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const targetDate = typeof date === "string" ? new Date(date) : date;
  const diffInSeconds = Math.floor(
    (now.getTime() - targetDate.getTime()) / 1000,
  );
  const absSeconds = Math.abs(diffInSeconds);
  const isFuture = diffInSeconds < 0;

  // Now
  if (absSeconds < 30) {
    return "now";
  }

  // Minutes
  const absMinutes = Math.floor(absSeconds / 60);
  if (absMinutes < 60) {
    const mins = absMinutes || 1;
    return isFuture ? `in ${mins} min` : `${mins} min ago`;
  }

  // Hours
  const absHours = Math.floor(absMinutes / 60);
  if (absHours < 24) {
    return isFuture ? `in ${absHours} hr` : `${absHours} hr ago`;
  }

  // Days
  const absDays = Math.floor(absHours / 24);
  if (absDays < 30) {
    const dayStr = absDays === 1 ? "day" : "days";
    return isFuture ? `in ${absDays} ${dayStr}` : `${absDays} ${dayStr} ago`;
  }

  // Months
  const absMonths = Math.floor(absDays / 30);
  if (absMonths < 12) {
    return isFuture ? `in ${absMonths} mo` : `${absMonths} mo ago`;
  }

  // Years
  const absYears = Math.floor(absMonths / 12);
  return isFuture ? `in ${absYears} yr` : `${absYears} yr ago`;
}
