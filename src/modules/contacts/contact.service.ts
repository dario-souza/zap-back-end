import { ContactRepository } from './contact.repository.js';
import type { Contact, CreateContactInput, UpdateContactInput } from './contact.types.js';

export class ContactService {
  private repository: ContactRepository;

  constructor() {
    this.repository = new ContactRepository();
  }

  async getAll(userId: string): Promise<Contact[]> {
    return this.repository.findAll(userId);
  }

  async getById(id: string, userId: string): Promise<Contact | null> {
    return this.repository.findById(id, userId);
  }

  async create(userId: string, input: CreateContactInput): Promise<Contact> {
    return this.repository.create(userId, input);
  }

  async update(id: string, userId: string, input: UpdateContactInput): Promise<Contact> {
    return this.repository.update(id, userId, input);
  }

  async delete(id: string, userId: string): Promise<void> {
    return this.repository.delete(id, userId);
  }

  async deleteAll(userId: string): Promise<void> {
    return this.repository.deleteAll(userId);
  }
}
