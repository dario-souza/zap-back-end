export type RecurrenceConfig =
  | { frequency: 'weekly'; dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6 }
  | { frequency: 'monthly'; dayOfMonth: number }

export type JobPayload = {
  type: 'scheduled' | 'recurring' | 'instant_bulk' | 'confirmation'
  messageId: string
  userId: string
  sessionName: string
  phone: string
  content: string
  contactId?: string
  scheduledAt?: string
  recurrence?: RecurrenceConfig
  recurrenceCron?: string
  confirmationId?: string
  contactName?: string
  eventDate?: string
}
