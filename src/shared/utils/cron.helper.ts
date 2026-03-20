export type RecurrenceFrequency = 'weekly' | 'monthly'

export interface RecurrenceConfig {
  frequency: RecurrenceFrequency
  dayOfWeek?: number
  dayOfMonth?: number
  hour?: number
  minute?: number
}

export function buildCronExpression(config: RecurrenceConfig): string {
  const minute = config.minute ?? 0
  const hour = config.hour ?? 9

  if (config.frequency === 'weekly') {
    const day = config.dayOfWeek ?? 0
    return `${minute} ${hour} * * ${day}`
  }

  if (config.frequency === 'monthly') {
    const day = config.dayOfMonth ?? 1
    return `${minute} ${hour} ${day} * *`
  }

  throw new Error(`Frequência inválida: ${(config as any).frequency}`)
}

export function parseCronExpression(cron: string): RecurrenceConfig | null {
  const parts = cron.trim().split(/\s+/)
  if (parts.length < 5) return null

  const [minute, hour, dayOfMonth, , dayOfWeek] = parts

  if (dayOfMonth !== '*') {
    return {
      frequency: 'monthly',
      dayOfMonth: parseInt(dayOfMonth),
      hour: parseInt(hour),
      minute: parseInt(minute),
    }
  }

  if (dayOfWeek !== '*') {
    return {
      frequency: 'weekly',
      dayOfWeek: parseInt(dayOfWeek),
      hour: parseInt(hour),
      minute: parseInt(minute),
    }
  }

  return null
}

export const WEEKDAY_LABELS: Record<number, string> = {
  0: 'Domingo',
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
}

export function formatRecurrenceLabel(recurrenceType: string, recurrenceCron?: string): string {
  if (!recurrenceCron) return ''

  const config = parseCronExpression(recurrenceCron)
  if (!config) return recurrenceCron

  const time = `${String(config.hour ?? 0).padStart(2, '0')}:${String(config.minute ?? 0).padStart(2, '0')}`

  if (config.frequency === 'weekly') {
    const dayLabel = WEEKDAY_LABELS[config.dayOfWeek ?? 0] ?? `Dia ${config.dayOfWeek}`
    return `Toda ${dayLabel} às ${time}`
  }

  if (config.frequency === 'monthly') {
    return `Todo dia ${config.dayOfMonth} às ${time}`
  }

  return recurrenceCron
}
