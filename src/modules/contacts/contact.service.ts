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

  async importCSV(userId: string, csvContent: string): Promise<{ success: number; failed: number }> {
    const lines = csvContent.trim().split('\n');
    let success = 0;
    let failed = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(',').map(p => p.trim().replace(/"/g, ''));
      
      if (parts.length >= 2) {
        try {
          const name = parts[0];
          const phone = parts[1].replace(/\D/g, '');
          const email = parts[2] || undefined;

          if (phone.length >= 10) {
            await this.repository.create(userId, { name, phone, email });
            success++;
          } else {
            failed++;
          }
        } catch (error) {
          console.error('Erro ao importar contato:', error);
          failed++;
        }
      } else {
        failed++;
      }
    }

    return { success, failed };
  }

  async exportCSV(userId: string): Promise<string> {
    const contacts = await this.repository.findAll(userId);
    
    let csv = 'Nome,Telefone,Email\n';
    
    for (const contact of contacts) {
      csv += `"${contact.name}","${contact.phone}","${contact.email || ''}"\n`;
    }
    
    return csv;
  }
}
