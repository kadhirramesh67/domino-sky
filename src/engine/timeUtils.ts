/** Parse "HH:MM" to minutes since midnight */
export function parseTime(hhmm: string): number {
  const parts = hhmm.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  return h * 60 + m;
}

/** Format minutes since midnight to "HH:MM" */
export function formatTime(mins: number): string {
  const totalMins = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Returns true if time is in [start, end) */
export function isInWindow(time: number, start: number, end: number): boolean {
  return time >= start && time < end;
}

/** Format delay minutes as human-readable string */
export function formatDelay(mins: number): string {
  if (mins <= 0) return 'On time';
  if (mins < 60) return `+${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `+${h}h` : `+${h}h ${m}m`;
}
