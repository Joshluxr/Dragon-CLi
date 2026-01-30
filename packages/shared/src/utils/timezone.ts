function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch (error) {
    return false;
  }
}

export function validateTimezone(timezone: string): string {
  if (isValidTimeZone(timezone)) {
    return timezone;
  }
  return "UTC";
}

export function toUTC(date: Date): Date {
  return new Date(date.toISOString());
}
