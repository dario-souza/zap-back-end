import { Response } from 'express';
import { MessageService } from './message.service.js';
import type { AuthRequest } from '../../middleware/auth.js';
import type { CreateMessageInput, UpdateMessageInput } from './message.types.js';

export class MessageController {
  private service: MessageService;

  constructor() {
    this.service = new MessageService();
  }

  async getAll(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const messages = await this.service.getAll(userId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar mensagens' });
    }
  }

  async getById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const message = await this.service.getById(id, userId);

      if (!message) {
        res.status(404).json({ error: 'Mensagem não encontrada' });
        return;
      }

      res.json(message);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar mensagem' });
    }
  }

  async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const input: CreateMessageInput = req.body;
      const message = await this.service.create(userId, input);
      res.status(201).json(message);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao criar mensagem' });
    }
  }

  async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const input: UpdateMessageInput = req.body;
      const message = await this.service.update(id, userId, input);
      res.json(message);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao atualizar mensagem' });
    }
  }

  async delete(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      await this.service.delete(id, userId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Erro ao excluir mensagem' });
    }
  }

  async deleteAll(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      await this.service.deleteAll(userId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: 'Erro ao excluir mensagens' });
    }
  }

  async sendNow(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const message = await this.service.sendNow(id, userId);
      res.json(message);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao enviar mensagem' });
    }
  }
}
