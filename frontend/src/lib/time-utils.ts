/**
 * WorkGrid Centralized Timezone & Dynamic Time Utilities
 * Standard Presentation Timezone: Asia/Kolkata (IST, UTC+05:30)
 */

export const APP_TIMEZONE = 'Asia/Kolkata';
export const TIMEZONE_LABEL = 'IST';

/**
 * Returns current timestamp in UTC
 */
export function getCurrentDate(): Date {
  return new Date();
}

/**
 * Returns the current wall-clock hour (0-23) in Asia/Kolkata — a naive local
 * hour, never a UTC hour.
 */
export function getCurrentISTHour(): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    hour: 'numeric',
    hour12: false,
  });
  return parseInt(formatter.format(new Date()), 10) % 24;
}

/**
 * Formats a naive 0-24 local wall-clock hour (no timezone conversion) into a
 * 12-hour clock label, e.g. 9 -> "09:00 AM", 24 -> "12:00 AM". Used for
 * genuinely naive-hour display (e.g. the "Active Window" clock on the
 * Server dashboard) — never mix this with a Date/UTC conversion.
 */
export function formatSlotHourLabel(hour: number): string {
  const h = hour % 24;
  const period = h < 12 ? 'AM' : 'PM';
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour.toString().padStart(2, '0')}:00 ${period}`;
}

/**
 * Formats a Date/ISO string to IST time (e.g. "04:30 PM IST")
 */
export function formatToISTTime(date: Date | string | number, includeTimezone = true): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';

  const timeStr = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);

  return includeTimezone ? `${timeStr} ${TIMEZONE_LABEL}` : timeStr;
}

/**
 * Formats a Date/ISO string to IST date (e.g. "20 Aug 2026")
 */
export function formatToISTDate(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';

  return new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/**
 * Formats a Date/ISO string to full IST date + time (e.g. "20 Aug 2026, 04:30 PM IST")
 */
export function formatToISTDateTime(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';

  const dateStr = formatToISTDate(d);
  const timeStr = formatToISTTime(d);
  return `${dateStr}, ${timeStr}`;
}

/**
 * Formats relative time from now in IST (e.g. "Just now", "5m ago", "Today at 3:45 PM IST")
 */
export function formatRelativeIST(date: Date | string | number): string {
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;

  return formatToISTDateTime(d);
}

