import { MessageRepository } from './message.repository.js';
import { ContactRepository } from '../contacts/contact.repository.js';
import { sendMessageJob, sendReminderJob, scheduleRecurringJob } from '../../queues/messageQueue.js';
import type { Message, CreateMessageInput, UpdateMessageInput } from './message.types.js';

export class MessageService {
  private repository: MessageRepository;
  private contactRepository: ContactRepository;

  constructor() {
    this.repository = new MessageRepository();
    this.contactRepository = new ContactRepository();
  }

  async getAll(userId: string): Promise<Message[]> {
    return this.repository.findAll(userId);
  }

  async getById(id: string, userId: string): Promise<Message | null> {
    return this.repository.findById(id, userId);
  }

  async create(userId: string, input: CreateMessageInput): Promise<Message> {
    const message = await this.repository.create(userId, input);

    if (message.status === 'SCHEDULED' && message.scheduled_at) {
      await sendMessageJob({
        messageId: message.id,
        phone: message.phone,
        content: message.content,
        scheduledAt: message.scheduled_at,
        userId,
      });

      if (input.reminder_days && input.reminder_days > 0) {
        const reminderDate = new Date(message.scheduled_at);
        reminderDate.setDate(reminderDate.getDate() - input.reminder_days);

        if (reminderDate > new Date()) {
          await sendReminderJob({
            messageId: message.id,
            phone: message.phone,
            content: `Lembrete: Você tem uma mensagem agendada para ${message.scheduled_at}`,
            reminderDate: reminderDate.toISOString(),
          });
        }
      }
    }

    if (input.recurrence_type && input.recurrence_type !== 'NONE' && input.recurrence_cron) {
      await scheduleRecurringJob({
        messageId: message.id,
        phone: message.phone,
        content: message.content,
        cron: input.recurrence_cron,
      });
    }

    return message;
  }

  async update(id: string, userId: string, input: UpdateMessageInput): Promise<Message> {
    return this.repository.update(id, userId, input);
  }

  async delete(id: string, userId: string): Promise<void> {
    return this.repository.delete(id, userId);
  }

  async deleteAll(userId: string): Promise<void> {
    return this.repository.deleteAll(userId);
  }

  async sendNow(id: string, userId: string): Promise<Message> {
    const message = await this.repository.findById(id, userId);
    
    if (!message) {
      throw new Error('Mensagem não encontrada');
    }

    await sendMessageJob({
      messageId: message.id,
      phone: message.phone,
      content: message.content,
      userId,
    });

    return this.repository.update(id, userId, { status: 'PENDING' });
  }

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
        const contact = await this.contactRepository.findById(contactId, userId);
        if (!contact) {
          failed++;
          continue;
        }

        await this.create(userId, {
          content,
          contact_id: contactId,
          phone: contact.phone,
          scheduled_at: scheduledAt,
          status: sendNow ? 'PENDING' : 'SCHEDULED',
          recurrence_type: recurrenceType || 'NONE',
        });
        success++;
      } catch (error) {
        console.error('Erro ao criar mensagem para contato:', contactId, error);
        failed++;
      }
    }

    return { success, failed, total: contactIds.length };
  }

  async createWithReminder(
    userId: string,
    content: string,
    contactId: string,
    scheduledAt: string,
    reminderDays: number
  ): Promise<Message> {
    return this.create(userId, {
      content,
      contact_id: contactId,
      scheduled_at: scheduledAt,
      status: 'SCHEDULED',
      reminder_days: reminderDays,
      is_reminder: false,
    });
  }

  async sendTest(userId: string, phone: string, message: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const { WahaService } = await import('../../services/waha.service.js');
      const wahaService = new WahaService();
      
      const result = await wahaService.sendMessage(userId, phone, message);
      
      if (result) {
        return { success: true };
      }
      
      return { success: false, error: 'Falha ao enviar mensagem' };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
}
