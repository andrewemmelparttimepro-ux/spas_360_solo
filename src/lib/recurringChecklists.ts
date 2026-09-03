export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function checklistItemsFromText(value: string): string[] {
  return [...new Set(value.replace(/\r/g, '').split('\n').map(line => line.trim()).filter(Boolean))].slice(0, 40);
}

/** "Mon–Sat", "every day", "Mon, Wed, Fri" */
export function describeWeekdays(weekdays: number[]): string {
  const days = [...new Set(weekdays)].filter(day => day >= 1 && day <= 7).sort((a, b) => a - b);
  if (days.length === 7) return 'every day';
  if (days.length === 0) return 'no days';
  const contiguous = days.every((day, index) => index === 0 || day === days[index - 1] + 1);
  if (contiguous && days.length > 2) return `${WEEKDAY_LABELS[days[0] - 1]}–${WEEKDAY_LABELS[days[days.length - 1] - 1]}`;
  return days.map(day => WEEKDAY_LABELS[day - 1]).join(', ');
}

export function formatDueTime(time: string): string {
  const [hour, minute] = time.split(':').map(Number);
  if (!Number.isFinite(hour)) return time;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${String(minute || 0).padStart(2, '0')} ${suffix}`;
}
