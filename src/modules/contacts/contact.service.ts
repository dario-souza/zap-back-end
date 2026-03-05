import { contactRepository } from './contact.repository.ts';
import type { Contact, CreateContactDto, UpdateContactDto } from './contact.types.ts';

export const contactService = {
  async getAll(userId: string): Promise<Contact[]> {
    return contactRepository.findAll(userId);
  },

  async getById(id: string, userId: string): Promise<Contact | null> {
    return contactRepository.findById(id, userId);
  },

  async create(userId: string, input: CreateContactDto): Promise<Contact> {
    return contactRepository.create(userId, input);
  },

  async update(id: string, userId: string, input: UpdateContactDto): Promise<Contact> {
    return contactRepository.update(id, userId, input);
  },

  async delete(id: string, userId: string): Promise<void> {
    return contactRepository.delete(id, userId);
  },

  async deleteAll(userId: string): Promise<void> {
    return contactRepository.deleteAll(userId);
  },

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
            await contactRepository.create(userId, { name, phone, email });
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
  },

  async exportCSV(userId: string): Promise<string> {
    const contacts = await contactRepository.findAll(userId);
    
    let csv = 'Nome,Telefone,Email\n';
    
    for (const contact of contacts) {
      csv += `"${contact.name}","${contact.phone}","${contact.email || ''}"\n`;
    }
    
    return csv;
  },
};
