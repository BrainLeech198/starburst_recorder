/** Map the app's Monday=1…Sunday=7 convention to Capacitor's Sunday=1 convention. */
export function weighNotificationSchedule(
  weighDay: number,
  weighTime: string,
): { every: 'week'; on: { weekday: number; hour: number; minute: number } } | null {
  if (!Number.isInteger(weighDay) || weighDay < 1 || weighDay > 7) return null

  const matched = weighTime.match(/^(\d{1,2}):(\d{2})$/)
  const parsedHour = matched ? Number(matched[1]) : 7
  const parsedMinute = matched ? Number(matched[2]) : 0
  const hour = Number.isFinite(parsedHour) ? Math.max(0, Math.min(23, parsedHour)) : 7
  const minute = Number.isFinite(parsedMinute) ? Math.max(0, Math.min(59, parsedMinute)) : 0

  return {
    every: 'week',
    on: { weekday: (weighDay % 7) + 1, hour, minute },
  }
}
