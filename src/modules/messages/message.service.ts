import { messageRepository } from './message.repository'
import { contactRepository } from '../contacts/contact.repository'
import { messageQueue } from '../../queue/queue'
import { whatsappService } from '../../integrations/whatsapp/whatsapp.service'
import { messageLogRepository } from './message-log.repository'
import type { Message, CreateMessageDto, UpdateMessageDto, MessageStatus } from './message.types'

const getSessionName = (userId: string): string => {
  return whatsappService.getSessionName(userId)
}

const replaceVariables = (
  content: string,
  contact: { name?: string; phone?: string; email?: string } | null,
): string => {
  if (!contact) return content

  let result = content
  result = result.replace(/\{\{nome\}\}/gi, contact.name || '')
  result = result.replace(/\{\{name\}\}/gi, contact.name || '')
  result = result.replace(/\{\{phone\}\}/gi, contact.phone || '')
  result = result.replace(/\{\{telefone\}\}/gi, contact.phone || '')
  result = result.replace(/\{\{email\}\}/gi, contact.email || '')

  return result
}

export const messageService = {
  async getAll(userId: string): Promise<Message[]> {
    return messageRepository.findAll(userId)
  },

  async getById(id: string, userId: string): Promise<Message | null> {
    return messageRepository.findById(id, userId)
  },

  async create(userId: string, input: CreateMessageDto): Promise<Message> {
    const sessionName = getSessionName(userId)

    const messageType = input.type || 'instant'

    if (messageType === 'scheduled' && input.scheduled_at) {
      const message = await messageRepository.create(userId, {
        ...input,
        type: 'scheduled',
        status: 'pending',
      })

      const scheduledAt = message.scheduled_at || ''
      const jobId = await messageQueue.addScheduled({
        type: 'scheduled',
        messageId: message.id,
        userId,
        sessionName,
        phone: message.phone,
        content: message.content,
        contactId: message.contact_id,
        scheduledAt,
      })

      await messageRepository.updateJobId(message.id, userId, jobId || null)

      if (input.recurrence_type && input.recurrence_type !== 'NONE' && input.recurrence_cron) {
        const schedulerId = `recurring_${message.id}`
        await messageQueue.addRecurring(schedulerId, {
          type: 'recurring',
          messageId: message.id,
          userId,
          sessionName,
          phone: message.phone,
          content: message.content,
          contactId: message.contact_id,
        }, input.recurrence_cron)

        await messageRepository.updateJobId(message.id, userId, schedulerId)
      }

      return message
    }

    if (messageType === 'recurring' && input.recurrence_type && input.recurrence_type !== 'NONE') {
      const message = await messageRepository.create(userId, {
        ...input,
        type: 'recurring',
        status: 'pending',
      })

      if (input.recurrence_cron) {
        const schedulerId = `recurring_${message.id}`
        
        let shouldCreateSingleJob = false
        
        if (input.scheduled_at) {
          const scheduledDate = new Date(input.scheduled_at)
          const now = new Date()
          
          if (scheduledDate > now) {
            const [cronMinutes, cronHours, cronDayOfMonth] = input.recurrence_cron.split(' ')
            const today = new Date()
            const todayDay = today.getDate()
            const todayMonth = today.getMonth() + 1
            
            const cronDay = parseInt(cronDayOfMonth)
            
            const isTodayMatchingCron = cronDay === todayDay
            const isScheduledToday = scheduledDate.getDate() === todayDay && 
                                   scheduledDate.getMonth() === today.getMonth()
            
            if (!isTodayMatchingCron || !isScheduledToday) {
              shouldCreateSingleJob = true
            }
          } else {
            shouldCreateSingleJob = true
          }
          
          if (shouldCreateSingleJob) {
            const delay = scheduledDate.getTime() - Date.now()
            const jobId = await messageQueue.add('send-message', {
              type: 'scheduled',
              messageId: message.id,
              userId,
              sessionName,
              phone: message.phone,
              content: message.content,
              contactId: message.contact_id,
            }, { delay })
            
            await messageRepository.updateJobId(message.id, userId, jobId || null)
          }
        }
        
        await messageQueue.addRecurring(schedulerId, {
          type: 'recurring',
          messageId: message.id,
          userId,
          sessionName,
          phone: message.phone,
          content: message.content,
          contactId: message.contact_id,
          recurrenceCron: input.recurrence_cron,
        }, input.recurrence_cron)

        await messageRepository.updateJobId(message.id, userId, schedulerId)
      }

      return message
    }

    const message = await messageRepository.create(userId, {
      ...input,
      type: 'instant',
      status: 'pending',
    })

    let finalContent = message.content

    if (message.contact_id) {
      const contact = await contactRepository.findById(message.contact_id, userId)
      if (contact) {
        finalContent = replaceVariables(message.content, contact)
      }
    }

    const result = await whatsappService.send(sessionName, message.phone, finalContent)

    if (result.success) {
      await messageRepository.updateStatus(message.id, userId, 'sent')
      await messageRepository.updateWaMessageId(message.id, userId, result.id || null)
      await messageLogRepository.create({
        messageId: message.id,
        userId,
        event: 'sent',
        wahaMessageId: result.id,
      })
    } else {
      await messageRepository.updateStatus(message.id, userId, 'failed')
      await messageLogRepository.create({
        messageId: message.id,
        userId,
        event: 'failed',
        metadata: { error: result.error },
      })
    }

    return message
  },

  async update(id: string, userId: string, input: UpdateMessageDto): Promise<Message> {
    return messageRepository.update(id, userId, input)
  },

  async delete(id: string, userId: string): Promise<void> {
    const message = await messageRepository.findById(id, userId)
    
    if (message?.job_id) {
      if (message.job_id.startsWith('recurring_')) {
        await messageQueue.removeRecurring(message.job_id)
      } else {
        const job = await messageQueue.getJob(message.job_id)
        if (job) {
          await job.remove()
        }
      }
    }
    
    return messageRepository.delete(id, userId)
  },

  async deleteAllRecurring(userId: string): Promise<number> {
    const messages = await messageRepository.findAll(userId)
    const recurringMessages = messages.filter(
      (m) => m.recurrence_type && m.recurrence_type !== 'NONE'
    )
    
    for (const message of recurringMessages) {
      if (message.job_id) {
        if (message.job_id.startsWith('recurring_')) {
          await messageQueue.removeRecurring(message.job_id)
        } else {
          const job = await messageQueue.getJob(message.job_id)
          if (job) {
            await job.remove()
          }
        }
      }
      await messageRepository.delete(message.id, userId)
    }
    
    return recurringMessages.length
  },

  async deleteAll(userId: string): Promise<void> {
    return messageRepository.deleteAll(userId)
  },

  async cancel(id: string, userId: string): Promise<Message> {
    const message = await messageRepository.findById(id, userId)
    
    if (!message) {
      throw new Error('Mensagem não encontrada')
    }

    if (message.status !== 'pending' && message.status !== 'SCHEDULED' && message.status !== 'PENDING') {
      throw new Error('Apenas mensagens pendentes podem ser canceladas')
    }

    if (message.job_id) {
      if (message.job_id.startsWith('recurring_')) {
        await messageQueue.removeRecurring(message.job_id)
      } else {
        const job = await messageQueue.getJob(message.job_id)
        if (job) {
          await job.remove()
        }
      }
    }

    return messageRepository.update(id, userId, { status: 'cancelled' })
  },

  async sendNow(id: string, userId: string): Promise<Message> {
    const message = await messageRepository.findById(id, userId)
    
    if (!message) {
      throw new Error('Mensagem não encontrada')
    }

    const sessionName = getSessionName(userId)

    let finalContent = message.content
    if (message.contact_id) {
      const contact = await contactRepository.findById(message.contact_id, userId)
      if (contact) {
        finalContent = replaceVariables(message.content, contact)
      }
    }

    const result = await whatsappService.send(sessionName, message.phone, finalContent)

    if (result.success) {
      await messageRepository.updateStatus(message.id, userId, 'sent')
      await messageRepository.updateWaMessageId(message.id, userId, result.id || null)
      await messageLogRepository.create({
        messageId: message.id,
        userId,
        event: 'sent',
        wahaMessageId: result.id,
      })
    } else {
      await messageRepository.updateStatus(message.id, userId, 'failed')
      await messageLogRepository.create({
        messageId: message.id,
        userId,
        event: 'failed',
        metadata: { error: result.error },
      })
    }

    return messageRepository.findById(id, userId) as Promise<Message>
  },

  async createBulk(
    userId: string, 
    content: string, 
    contactIds: string[], 
    scheduledAt?: string, 
    sendNow?: boolean,
    recurrenceType?: string
  ): Promise<{ success: number; failed: number; total: number }> {
    let success = 0
    let failed = 0
    const sessionName = getSessionName(userId)

    const isScheduledOrRecurring = scheduledAt || recurrenceType

    for (const contactId of contactIds) {
      try {
        const contact = await contactRepository.findById(contactId, userId)
        if (!contact) {
          failed++
          continue
        }

        const message = await messageRepository.create(userId, {
          content,
          phone: contact.phone,
          contact_id: contactId,
          status: 'pending',
          type: isScheduledOrRecurring ? (scheduledAt ? 'scheduled' : 'recurring') : 'instant',
          scheduled_at: scheduledAt,
          recurrence_type: (recurrenceType || 'NONE') as any,
        })

        if (isScheduledOrRecurring) {
          await this.create(userId, {
            content,
            phone: contact.phone,
            contact_id: contactId,
            scheduled_at: scheduledAt,
            status: 'pending',
            recurrence_type: (recurrenceType || 'NONE') as any,
            type: scheduledAt ? 'scheduled' : 'recurring',
          })
        } else {
          const jobId = await messageQueue.add('send-message', {
            type: 'instant_bulk',
            messageId: message.id,
            userId,
            sessionName,
            phone: contact.phone,
            content,
            contactId,
          })

          await messageRepository.updateJobId(message.id, userId, jobId || null)
        }

        success++
      } catch (error) {
        console.error('Erro ao criar mensagem para contato:', contactId, error)
        failed++
      }
    }

    return { success, failed, total: contactIds.length }
  },

  async createWithReminder(
    userId: string,
    content: string,
    contactId: string,
    scheduledAt: string,
    reminderDays: number
  ): Promise<Message> {
    const contact = await contactRepository.findById(contactId, userId)
    if (!contact) {
      throw new Error('Contato não encontrado')
    }

    return this.create(userId, {
      content,
      phone: contact.phone,
      contact_id: contactId,
      scheduled_at: scheduledAt,
      status: 'pending',
      reminder_days: reminderDays,
      is_reminder: false,
      type: 'scheduled',
    })
  },

  async sendTest(userId: string, phone: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const sessionName = getSessionName(userId)
    const result = await whatsappService.send(sessionName, phone, message)
    
    if (result.success) {
      return { success: true, messageId: result.id }
    }
    
    return { success: false, error: result.error || 'Falha ao enviar mensagem' }
  },
}
