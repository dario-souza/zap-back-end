import { Response } from 'express';
import { ContactService } from './contact.service.js';
import type { AuthRequest } from '../../middleware/auth.js';
import type { CreateContactInput, UpdateContactInput } from './contact.types.js';

export class ContactController {
  private service: ContactService;

  constructor() {
    this.service = new ContactService();
  }

  async getAll(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const contacts = await this.service.getAll(userId);
      res.json(contacts);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar contatos' });
    }
  }

  async getById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const contact = await this.service.getById(id, userId);

      if (!contact) {
        res.status(404).json({ error: 'Contato não encontrado' });
        return;
      }

      res.json(contact);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar contato' });
    }
  }

  async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const input: CreateContactInput = req.body;
      const contact = await this.service.create(userId, input);
      res.status(201).json(contact);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao criar contato' });
    }
  }

  async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const input: UpdateContactInput = req.body;
      const contact = await this.service.update(id, userId, input);
      res.json(contact);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao atualizar contato' });
    }
  }

  async delete(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      await this.service.delete(id, userId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Erro ao excluir contato' });
    }
  }

  async deleteAll(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      await this.service.deleteAll(userId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Erro ao excluir contatos' });
    }
  }
}
