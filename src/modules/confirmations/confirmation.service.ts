import { confirmationRepository } from './confirmation.repository.ts';
import type { Confirmation, ConfirmationStatus, CreateConfirmationDto, UpdateConfirmationDto } from './confirmation.types.ts';

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
    messageContent?: string
  ): Promise<Confirmation> {
    return confirmationRepository.create(userId, {
      contact_name: contactName,
      contact_phone: contactPhone,
      event_date: eventDate,
      message_content: messageContent,
      status: 'PENDING' as ConfirmationStatus,
    });
  },

  async update(id: string, userId: string, status: ConfirmationStatus, response?: string): Promise<Confirmation> {
    return confirmationRepository.update(id, userId, { status, response });
  },

  async delete(id: string, userId: string): Promise<void> {
    return confirmationRepository.delete(id, userId);
  },
};
