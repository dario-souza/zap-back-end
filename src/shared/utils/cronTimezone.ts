import { CronExpressionParser } from 'cron-parser'

function getCurrentTimeInTimezone(timezone: string): { day: number; hour: number; minute: number } {
  const now = new Date()
  const str = now.toLocaleString('en-US', { timeZone: timezone })
  const localDate = new Date(str)
  return {
    day: localDate.getDay(),
    hour: localDate.getHours(),
    minute: localDate.getMinutes(),
  }
}

export function convertCronToUTC(cronExpression: string, timezone: string = 'America/Sao_Paulo'): string {
  try {
    const nextDate = getNextExecutionTime(cronExpression, timezone)

    const utcMinute = nextDate.getUTCMinutes()
    const utcHour = nextDate.getUTCHours()
    const utcDayOfWeek = nextDate.getUTCDay()

    const parts = cronExpression.split(' ')

    parts[0] = String(utcMinute)
    parts[1] = String(utcHour)
    if (parts[4] !== '*') {
      parts[4] = String(utcDayOfWeek)
    }

    return parts.join(' ')
  } catch (error) {
    console.error('[CronTimezone] Erro ao converter cron para UTC:', error)
    return cronExpression
  }
}

export function getNextExecutionTime(cronExpression: string, timezone: string = 'America/Sao_Paulo'): Date {
  const [minuteStr, hourStr, , , dayOfWeekStr] = cronExpression.split(' ')
  const targetMinute = parseInt(minuteStr)
  const targetHour = parseInt(hourStr)
  const targetDay = dayOfWeekStr === '*' ? null : parseInt(dayOfWeekStr)

  const now = new Date()
  const current = getCurrentTimeInTimezone(timezone)

  const currentTimeInMinutes = current.hour * 60 + current.minute
  const targetTimeInMinutes = targetHour * 60 + targetMinute

  if (targetDay === null) {
    const next = new Date(now)
    next.setHours(targetHour, targetMinute, 0, 0)
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1)
    }
    return next
  }

  if (current.day === targetDay) {
    if (currentTimeInMinutes < targetTimeInMinutes) {
      const next = new Date(now)
      next.setHours(targetHour, targetMinute, 0, 0)
      console.log(`[CronTimezone] Hoje é o dia ${targetDay}, horário ainda não passou. Primeiro envio: ${next.toISOString()}`)
      return next
    }
  }

  const interval = CronExpressionParser.parse(cronExpression, {
    tz: timezone,
    currentDate: now,
  })

  const nextDate = interval.next().toDate()
  console.log(`[CronTimezone] Próximo envio (cron-parser): ${nextDate.toISOString()}`)
  return nextDate
}

export function getNextExecutionTimeUTC(cronExpression: string, timezone: string = 'America/Sao_Paulo'): Date {
  return getNextExecutionTime(cronExpression, timezone)
}
