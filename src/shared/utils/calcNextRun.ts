export function calculateNextSendAt(
  cronPattern: string,
  timezone: string = 'America/Sao_Paulo'
): Date {
  const [minutesStr, hoursStr, dayOfMonthStr, , dayOfWeekStr] = cronPattern.split(' ')
  
  const now = new Date()
  
  const targetHour = parseInt(hoursStr)
  const targetMinute = parseInt(minutesStr)

  const getDateInTimezone = (date: Date): Date => {
    const str = date.toLocaleString('en-US', { timeZone: timezone })
    return new Date(str)
  }

  const nowInTz = getDateInTimezone(now)
  const currentDay = nowInTz.getDay()
  const currentHour = nowInTz.getHours()
  const currentMinute = nowInTz.getMinutes()

  const next = new Date(now)

  if (dayOfMonthStr !== '*') {
    const targetDate = parseInt(dayOfMonthStr)
    const currentDate = nowInTz.getDate()
    const currentMonth = nowInTz.getMonth()
    const currentYear = nowInTz.getFullYear()

    next.setFullYear(currentYear, currentMonth, targetDate)
    next.setHours(targetHour, targetMinute, 0, 0)

    const nextInTz = getDateInTimezone(next)
    if (nextInTz < nowInTz) {
      next.setMonth(next.getMonth() + 1)
    }
  } else if (dayOfWeekStr !== '*') {
    const targetDay = parseInt(dayOfWeekStr)
    let daysToAdd = targetDay - currentDay

    if (daysToAdd < 0) {
      daysToAdd += 7
    } else if (daysToAdd === 0) {
      const currentTimeInMinutes = currentHour * 60 + currentMinute
      const targetTimeInMinutes = targetHour * 60 + targetMinute

      if (currentTimeInMinutes < targetTimeInMinutes) {
        daysToAdd = 0
      } else {
        daysToAdd = 7
      }
    }

    next.setDate(next.getDate() + daysToAdd)
    next.setHours(targetHour, targetMinute, 0, 0)
  } else {
    next.setHours(targetHour, targetMinute, 0, 0)
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1)
    }
  }

  return next
}

export function buildCronExpressionWithTimezone(
  config: {
    frequency: 'weekly' | 'monthly'
    dayOfWeek?: number
    dayOfMonth?: number
    hour?: number
    minute?: number
  },
  timezone: string = 'America/Sao_Paulo'
): string {
  const minute = config.minute ?? 0
  const hour = config.hour ?? 9

  let cronExpression: string

  if (config.frequency === 'weekly') {
    const day = config.dayOfWeek ?? 0
    cronExpression = `${minute} ${hour} * * ${day}`
  } else if (config.frequency === 'monthly') {
    const day = config.dayOfMonth ?? 1
    cronExpression = `${minute} ${hour} ${day} * *`
  } else {
    throw new Error(`Frequência inválida: ${(config as any).frequency}`)
  }

  return cronExpression
}
