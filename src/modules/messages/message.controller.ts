import { Response } from 'express';
import { MessageService } from './message.service.js';
import type { AuthRequest } from '../../middleware/auth.js';
import type { CreateMessageInput, UpdateMessageInput } from './message.types.js';
import { asyncHandler, getUserId } from '../../lib/baseController.js';

export class MessageController {
  private service: MessageService;

  constructor() {
    this.service = new MessageService();
  }

  getAll = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    const messages = await this.service.getAll(userId);
    res.json(messages);
  });

  getById = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    const { id } = req.params;
    const message = await this.service.getById(id, userId);

    if (!message) {
      res.status(404).json({ error: 'Mensagem não encontrada' });
      return;
    }

    res.json(message);
  });

  create = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    const input: CreateMessageInput = req.body;
    const message = await this.service.create(userId, input);
    res.status(201).json(message);
  });

  update = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    const { id } = req.params;
    const input: UpdateMessageInput = req.body;
    const message = await this.service.update(id, userId, input);
    res.json(message);
  });

  delete = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    const { id } = req.params;
    await this.service.delete(id, userId);
    res.status(204).send();
  });

  deleteAll = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    await this.service.deleteAll(userId);
    res.status(204).send();
  });

  sendNow = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    const { id } = req.params;
    const message = await this.service.sendNow(id, userId);
    res.json(message);
  });

  createBulk = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    const { content, contactIds, scheduledAt, sendNow, recurrenceType } = req.body;
    
    if (!content || !contactIds || !Array.isArray(contactIds)) {
      res.status(400).json({ error: 'Conteúdo e lista de contatos são obrigatórios' });
      return;
    }

    const result = await this.service.createBulk(userId, content, contactIds, scheduledAt, sendNow, recurrenceType);
    res.status(201).json(result);
  });

  createWithReminder = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    const { content, contactId, scheduledAt, reminderDays } = req.body;
    
    if (!content || !contactId || !scheduledAt || !reminderDays) {
      res.status(400).json({ error: 'Todos os campos são obrigatórios' });
      return;
    }

    const message = await this.service.createWithReminder(userId, content, contactId, scheduledAt, reminderDays);
    res.status(201).json(message);
  });

  sendTest = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    const { phone, message } = req.body;
    
    if (!phone || !message) {
      res.status(400).json({ error: 'Telefone e mensagem são obrigatórios' });
      return;
    }

    const result = await this.service.sendTest(userId, phone, message);
    res.json(result);
  });
}
