export function calculateNextSendAt(cronPattern: string): Date {
  const [minutesStr, hoursStr, dayOfMonthStr, , dayOfWeekStr] = cronPattern.split(' ')
  const now = new Date()

  const utcHour = parseInt(hoursStr)
  const utcMinute = parseInt(minutesStr)

  const next = new Date(now)
  next.setUTCHours(utcHour, utcMinute, 0, 0)

  if (dayOfMonthStr !== '*') {
    const targetDate = parseInt(dayOfMonthStr)
    next.setUTCDate(targetDate)
  }

  if (dayOfWeekStr !== '*') {
    const targetDay = parseInt(dayOfWeekStr)
    const currentDay = next.getUTCDay()
    let daysToAdd = targetDay - currentDay
    if (daysToAdd < 0 || (daysToAdd === 0 && next.getTime() <= now.getTime())) {
      daysToAdd += 7
    }
    next.setUTCDate(next.getUTCDate() + daysToAdd)
  }

  if (next.getTime() <= now.getTime()) {
    if (dayOfMonthStr !== '*') {
      next.setUTCMonth(next.getUTCMonth() + 1)
    } else if (dayOfWeekStr !== '*') {
      next.setUTCDate(next.getUTCDate() + 7)
    }
  }

  return next
}
