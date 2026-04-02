import { confirmationRepository } from './confirmation.repository.ts';
import { sessionService } from '../sessions/session.service.ts';
import { messageQueue } from '../../queue/queue.ts';
import { whatsappService } from '../../integrations/whatsapp/whatsapp.service.ts';
import { AppError } from '../../shared/errors/AppError.ts';
import type { Confirmation, ConfirmationStatus, CreateConfirmationDto, UpdateConfirmationDto, ConfirmationMessageStatus } from './confirmation.types.ts';

export const confirmationService = {
  async getAll(userId: string): Promise<Confirmation[]> {
    return confirmationRepository.findAll(userId);
  },

  async getById(id: string, userId: string): Promise<Confirmation | null> {
    return confirmationRepository.findById(id, userId);
  },

  async create(
    userId: string,
    contactName: string,
    contactPhone: string,
    eventDate: string,
    sendAt: string | undefined,
    messageContent: string | undefined,
    contactId?: string,
    confirmationResponseMessage?: string,
    cancellationResponseMessage?: string,
  ): Promise<Confirmation> {
    const confirmation = await confirmationRepository.create(userId, {
      contact_id: contactId,
      contact_name: contactName,
      contact_phone: contactPhone,
      event_date: eventDate,
      send_at: sendAt,
      message_content: messageContent,
      confirmation_response_message: confirmationResponseMessage,
      cancellation_response_message: cancellationResponseMessage,
      status: 'pending',
    });

    const sessionName = sessionService.generateSessionName(userId);
    const payload = {
      type: 'confirmation' as const,
      messageId: confirmation.id,
      userId,
      sessionName,
      phone: contactPhone.replace(/\D/g, ''),
      content: messageContent || '',
      contactId,
      confirmationId: confirmation.id,
      contactName,
      eventDate,
    };

    try {
      if (sendAt) {
        const jobId = await messageQueue.addConfirmation(payload, sendAt);
        if (jobId) {
          await confirmationRepository.updateJobId(confirmation.id, userId, jobId);
        }
      } else {
        const humanDelay = Math.floor(Math.random() * 3000) + 2000;
        const jobId = await messageQueue.addConfirmation(payload, new Date(Date.now() + humanDelay).toISOString());
        if (jobId) {
          await confirmationRepository.updateJobId(confirmation.id, userId, jobId);
        }
      }
    } catch (queueErr) {
      console.error('[ConfirmationService] Erro ao agendar job:', queueErr);
    }

    return confirmation;
  },

  async update(id: string, userId: string, status: ConfirmationStatus, response?: string): Promise<Confirmation> {
    return confirmationRepository.update(id, userId, { status, response });
  },

  async updateMessageStatus(id: string, messageStatus: ConfirmationMessageStatus, waMessageId?: string): Promise<void> {
    return confirmationRepository.updateMessageStatus(id, messageStatus, waMessageId);
  },

  async sendNow(
    id: string,
    userId: string,
  ): Promise<void> {
    const confirmation = await confirmationRepository.findById(id, userId);
    if (!confirmation) throw new AppError('Confirmação não encontrada', 404);
    if (confirmation.status !== 'pending') throw new AppError('Confirmação já respondida', 400);

    const sessionName = sessionService.generateSessionName(userId);
    const messageContent = confirmation.message_content || '';

    let finalContent = messageContent;
    finalContent = finalContent.replace(/\{\{contact_name\}\}/gi, confirmation.contact_name || '');
    finalContent = finalContent.replace(/\{\{nome\}\}/gi, confirmation.contact_name || '');
    finalContent = finalContent.replace(
      /\{\{event_date\}\}/gi,
      confirmation.event_date
        ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(confirmation.event_date))
        : '',
    );

    const result = await whatsappService.sendPoll(
      sessionName, 
      confirmation.contact_phone.replace(/\D/g, ''), 
      finalContent || 'Confirme sua presença',
      ['Sim', 'Não'],
      false
    );

    if (result.success && result.id) {
      await confirmationRepository.updateMessageStatus(id, 'sent', result.id);
    } else {
      await confirmationRepository.updateMessageStatus(id, 'failed')
      throw new AppError(result.error || 'Falha ao enviar poll', 503);
    }
  },

  async delete(id: string, userId: string): Promise<void> {
    const confirmation = await confirmationRepository.findById(id, userId);
    if (!confirmation) throw new AppError('Confirmação não encontrada', 404);

    if (confirmation.job_id) {
      const job = await messageQueue.getJob(confirmation.job_id);
      if (job) {
        await job.remove();
      }
    }

    return confirmationRepository.delete(id, userId);
  },

  async deleteAll(userId: string): Promise<number> {
    const confirmations = await confirmationRepository.findAll(userId);

    for (const conf of confirmations) {
      if (conf.job_id) {
        try {
          const job = await messageQueue.getJob(conf.job_id);
          if (job) await job.remove();
        } catch {
          // job pode já ter sido processado
        }
      }
    }

    return confirmationRepository.deleteAll(userId);
  },
};
