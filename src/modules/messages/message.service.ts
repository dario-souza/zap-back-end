import { MessageRepository } from './message.repository.js';
import { sendMessageJob, sendReminderJob, scheduleRecurringJob } from '../../queues/messageQueue.js';
import type { Message, CreateMessageInput, UpdateMessageInput } from './message.types.js';

export class MessageService {
  private repository: MessageRepository;

  constructor() {
    this.repository = new MessageRepository();
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
}
