import type { RecurrenceConfig } from '../../queue/job.types'

export function buildCronExpression(recurrence: RecurrenceConfig, hour = 9): string {
  if (recurrence.frequency === 'weekly') {
    return `0 ${hour} * * ${recurrence.dayOfWeek}`
  }

  if (recurrence.frequency === 'monthly') {
    return `0 ${hour} ${recurrence.dayOfMonth} * *`
  }

  throw new Error(`Frequência de recorrência inválida: ${(recurrence as any).frequency}`)
}

export function calculateNextSendAt(cronPattern: string): Date {
  const [minutes, hours, dayOfMonth, , dayOfWeek] = cronPattern.split(' ')
  const now = new Date()
  const next = new Date(now)

  next.setMinutes(parseInt(minutes))
  next.setHours(parseInt(hours))
  next.setSeconds(0)
  next.setMilliseconds(0)

  if (dayOfMonth !== '*') {
    next.setDate(parseInt(dayOfMonth))
  }

  if (dayOfWeek !== '*') {
    const targetDay = parseInt(dayOfWeek)
    const currentDay = next.getDay()
    let daysToAdd = targetDay - currentDay
    if (daysToAdd < 0 || (daysToAdd === 0 && next <= now)) {
      daysToAdd += 7
    }
    next.setDate(next.getDate() + daysToAdd)
  }

  if (next <= now) {
    if (dayOfMonth !== '*') {
      next.setMonth(next.getMonth() + 1)
    } else if (dayOfWeek !== '*') {
      next.setDate(next.getDate() + 7)
    }
  }

  return next
}
