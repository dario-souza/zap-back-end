import { messageRepository } from './message.repository.ts';
import { contactRepository } from '../contacts/contact.repository.ts';
import { sendMessageJob, sendReminderJob, scheduleRecurringJob } from '../../queues/messageQueue.ts';
import { wahaService } from '../../services/waha.service.ts';
import type { Message, CreateMessageDto, UpdateMessageDto, RecurrenceType, MessageStatus } from './message.types.ts';

export const messageService = {
  async getAll(userId: string): Promise<Message[]> {
    return messageRepository.findAll(userId);
  },

  async getById(id: string, userId: string): Promise<Message | null> {
    return messageRepository.findById(id, userId);
  },

  async create(userId: string, input: CreateMessageDto): Promise<Message> {
    if (input.scheduled_at) {
      const message = await messageRepository.create(userId, {
        ...input,
        status: 'SCHEDULED',
      });

      const jobId = await sendMessageJob(userId, {
        messageId: message.id,
        phone: message.phone,
        content: message.content,
        scheduledAt: message.scheduled_at,
        userId,
        contactId: message.contact_id,
      });

      await messageRepository.updateJobId(message.id, userId, jobId || null);

      if (input.reminder_days && input.reminder_days > 0 && message.scheduled_at) {
        const reminderDate = new Date(message.scheduled_at);
        reminderDate.setDate(reminderDate.getDate() - input.reminder_days);

        if (reminderDate > new Date()) {
          await sendReminderJob(userId, {
            messageId: message.id,
            phone: message.phone,
            content: `Lembrete: Você tem uma mensagem agendada para ${message.scheduled_at}`,
            reminderDate: reminderDate.toISOString(),
            userId,
          });
        }
      }

      if (input.recurrence_type && input.recurrence_type !== 'NONE' && input.recurrence_cron) {
        await scheduleRecurringJob(userId, {
          messageId: message.id,
          phone: message.phone,
          content: message.content,
          cron: input.recurrence_cron,
          userId,
        });
      }

      return message;
    }

    const message = await messageRepository.create(userId, {
      ...input,
      status: 'PENDING',
    });

    const jobId = await sendMessageJob(userId, {
      messageId: message.id,
      phone: message.phone,
      content: message.content,
      userId,
      contactId: message.contact_id,
    });

    await messageRepository.updateJobId(message.id, userId, jobId || null);

    return message;
  },

  async update(id: string, userId: string, input: UpdateMessageDto): Promise<Message> {
    return messageRepository.update(id, userId, input);
  },

  async delete(id: string, userId: string): Promise<void> {
    return messageRepository.delete(id, userId);
  },

  async deleteAll(userId: string): Promise<void> {
    return messageRepository.deleteAll(userId);
  },

  async cancel(id: string, userId: string): Promise<Message> {
    const message = await messageRepository.findById(id, userId);
    
    if (!message) {
      throw new Error('Mensagem não encontrada');
    }

    if (message.status !== 'SCHEDULED' && message.status !== 'PENDING') {
      throw new Error('Apenas mensagens pendentes ou agendadas podem ser canceladas');
    }

    return messageRepository.update(id, userId, { status: 'CANCELLED' as MessageStatus });
  },

  async sendNow(id: string, userId: string): Promise<Message> {
    const message = await messageRepository.findById(id, userId);
    
    if (!message) {
      throw new Error('Mensagem não encontrada');
    }

    await sendMessageJob(userId, {
      messageId: message.id,
      phone: message.phone,
      content: message.content,
      userId,
      contactId: message.contact_id,
    });

    return messageRepository.update(id, userId, { status: 'PENDING' });
  },

  async createBulk(
    userId: string, 
    content: string, 
    contactIds: string[], 
    scheduledAt?: string, 
    sendNow?: boolean,
    recurrenceType?: string
  ): Promise<{ success: number; failed: number; total: number }> {
    let success = 0;
    let failed = 0;

    for (const contactId of contactIds) {
      try {
        const contact = await contactRepository.findById(contactId, userId);
        if (!contact) {
          failed++;
          continue;
        }

        if (scheduledAt) {
          await this.create(userId, {
            content,
            phone: contact.phone,
            contact_id: contactId,
            scheduled_at: scheduledAt,
            status: 'SCHEDULED',
            recurrence_type: (recurrenceType || 'NONE') as RecurrenceType,
          });
        } else {
          const message = await messageRepository.create(userId, {
            content,
            phone: contact.phone,
            contact_id: contactId,
            status: 'PENDING',
          });
          
          await sendMessageJob(userId, {
            messageId: message.id,
            phone: contact.phone,
            content,
            userId,
            contactId,
          });
        }
        success++;
      } catch (error) {
        console.error('Erro ao criar mensagem para contato:', contactId, error);
        failed++;
      }
    }

    return { success, failed, total: contactIds.length };
  },

  async createWithReminder(
    userId: string,
    content: string,
    contactId: string,
    scheduledAt: string,
    reminderDays: number
  ): Promise<Message> {
    const contact = await contactRepository.findById(contactId, userId);
    if (!contact) {
      throw new Error('Contato não encontrado');
    }

    return this.create(userId, {
      content,
      phone: contact.phone,
      contact_id: contactId,
      scheduled_at: scheduledAt,
      status: 'SCHEDULED' as MessageStatus,
      reminder_days: reminderDays,
      is_reminder: false,
    });
  },

  async sendTest(userId: string, phone: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const result = await wahaService.sendMessage(userId, phone, message);
      
      if (result.success) {
        return { success: true, messageId: result.messageId };
      }
      
      return { success: false, error: result.error || 'Falha ao enviar mensagem' };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  },
};
