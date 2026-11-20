import { TIME_CONSTANTS } from '../constants/index';

/**
 * Parses time string in "HH:MM" format into minutes since midnight.
 *
 * @param hhmm Time string formatted as "HH:MM"
 * @returns Minutes since midnight (0..1439)
 */
export function parseTime(hhmm: string): number {
  const parts = hhmm.split(':');
  const h = parseInt(parts[0] ?? '0', 10);
  const m = parseInt(parts[1] ?? '0', 10);
  return h * TIME_CONSTANTS.MINUTES_IN_HOUR + m;
}

/**
 * Formats minutes since midnight into a standard 24-hour "HH:MM" string.
 *
 * @param mins Minutes since midnight
 * @returns Standard 24-hour time formatted as "HH:MM"
 */
export function formatTime(mins: number): string {
  const totalMins =
    ((mins % TIME_CONSTANTS.MINUTES_IN_DAY) + TIME_CONSTANTS.MINUTES_IN_DAY) %
    TIME_CONSTANTS.MINUTES_IN_DAY;
  const h = Math.floor(totalMins / TIME_CONSTANTS.MINUTES_IN_HOUR);
  const m = totalMins % TIME_CONSTANTS.MINUTES_IN_HOUR;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Determines whether a given minute timestamp falls within a half-open window [start, end).
 *
 * @param time Timestamp in minutes
 * @param start Window start minute (inclusive)
 * @param end Window end minute (exclusive)
 * @returns True if time is within the window
 */
export function isInWindow(time: number, start: number, end: number): boolean {
  return time >= start && time < end;
}

/**
 * Formats delay minutes as a human-readable operational string (e.g. "+30m", "+1h 15m", "On time").
 *
 * @param mins Delay duration in minutes
 * @returns Formatted delay string
 */
export function formatDelay(mins: number): string {
  if (mins <= 0) return 'On time';
  if (mins < TIME_CONSTANTS.MINUTES_IN_HOUR) return `+${mins}m`;
  const h = Math.floor(mins / TIME_CONSTANTS.MINUTES_IN_HOUR);
  const m = mins % TIME_CONSTANTS.MINUTES_IN_HOUR;
  return m === 0 ? `+${h}h` : `+${h}h ${m}m`;
}
