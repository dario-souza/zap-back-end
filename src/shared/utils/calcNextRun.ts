export function calculateNextSendAt(cronPattern: string): Date {
  const [minutesStr, hoursStr, dayOfMonthStr, , dayOfWeekStr] = cronPattern.split(' ')
  const now = new Date()

  const targetHour = parseInt(hoursStr)
  const targetMinute = parseInt(minutesStr)

  const next = new Date(now)
  next.setHours(targetHour, targetMinute, 0, 0)

  if (dayOfMonthStr !== '*') {
    const targetDate = parseInt(dayOfMonthStr)
    next.setDate(targetDate)
  }

  if (dayOfWeekStr !== '*') {
    const targetDay = parseInt(dayOfWeekStr)
    const currentDay = next.getDay()
    let daysToAdd = targetDay - currentDay
    if (daysToAdd < 0 || (daysToAdd === 0 && next.getTime() <= now.getTime())) {
      daysToAdd += 7
    }
    next.setDate(next.getDate() + daysToAdd)
  }

  if (next.getTime() <= now.getTime()) {
    if (dayOfMonthStr !== '*') {
      next.setMonth(next.getMonth() + 1)
    } else if (dayOfWeekStr !== '*') {
      next.setDate(next.getDate() + 7)
    }
  }

  return next
}
