import { messageRepository } from './message.repository'
import { contactRepository } from '../contacts/contact.repository'
import { messageQueue } from '../../queue/queue'
import { whatsappService } from '../../integrations/whatsapp/whatsapp.service'
import { messageLogRepository } from './message-log.repository'
import type { Message, CreateMessageDto, UpdateMessageDto, MessageStatus } from './message.types'

const getSessionName = (userId: string): string => {
  return whatsappService.getSessionName(userId)
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

    const message = await messageRepository.create(userId, {
      ...input,
      type: 'instant',
      status: 'pending',
    })

    const result = await whatsappService.send(sessionName, message.phone, message.content)

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
    return messageRepository.delete(id, userId)
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
    const result = await whatsappService.send(sessionName, message.phone, message.content)

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

    for (const contactId of contactIds) {
      try {
        const contact = await contactRepository.findById(contactId, userId)
        if (!contact) {
          failed++
          continue
        }

        if (scheduledAt || recurrenceType) {
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
          const message = await messageRepository.create(userId, {
            content,
            phone: contact.phone,
            contact_id: contactId,
            status: 'pending',
            type: 'instant',
          })
          
          const result = await whatsappService.send(sessionName, contact.phone, content)

          if (result.success) {
            await messageRepository.updateStatus(message.id, userId, 'sent')
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
