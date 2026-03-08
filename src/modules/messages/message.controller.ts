import { Response } from 'express';
import { messageService } from './message.service.ts';
import type { AuthRequest } from '../../middleware/auth.ts';
import type { CreateMessageDto, UpdateMessageDto } from './message.types.ts';
import { asyncHandler, getUserId } from '../../lib/baseController.ts';

export const messageController = {
  getAll: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    const messages = await messageService.getAll(userId);
    res.json(messages);
  }),

  getById: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    const { id } = req.params;
    const message = await messageService.getById(id, userId);

    if (!message) {
      res.status(404).json({ error: 'Mensagem não encontrada' });
      return;
    }

    res.json(message);
  }),

  create: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    const { chatId, body, contactId, templateId, scheduledAt } = req.body;
    
    const input: CreateMessageDto = {
      phone: chatId?.replace('@c.us', '').replace('@g.us', '') || '',
      content: body || '',
      contact_id: contactId,
      scheduled_at: scheduledAt,
    };
    
    const message = await messageService.create(userId, input);
    res.status(201).json(message);
  }),

  update: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    const { id } = req.params;
    const input: UpdateMessageDto = req.body;
    const message = await messageService.update(id, userId, input);
    res.json(message);
  }),

  delete: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    const { id } = req.params;
    await messageService.delete(id, userId);
    res.status(204).send();
  }),

  deleteAll: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    await messageService.deleteAll(userId);
    res.status(204).send();
  }),

  sendNow: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    const { id } = req.params;
    const message = await messageService.sendNow(id, userId);
    res.json(message);
  }),

  createBulk: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    const { content, contactIds, scheduledAt, sendNow, recurrenceType } = req.body;
    
    if (!content || !contactIds || !Array.isArray(contactIds)) {
      res.status(400).json({ error: 'Conteúdo e lista de contatos são obrigatórios' });
      return;
    }

    const result = await messageService.createBulk(userId, content, contactIds, scheduledAt, sendNow, recurrenceType);
    res.status(201).json(result);
  }),

  createWithReminder: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    const { content, contactId, scheduledAt, reminderDays } = req.body;
    
    if (!content || !contactId || !scheduledAt || !reminderDays) {
      res.status(400).json({ error: 'Todos os campos são obrigatórios' });
      return;
    }

    const message = await messageService.createWithReminder(userId, content, contactId, scheduledAt, reminderDays);
    res.status(201).json(message);
  }),

  sendTest: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    const { phone, message } = req.body;
    
    if (!phone || !message) {
      res.status(400).json({ error: 'Telefone e mensagem são obrigatórios' });
      return;
    }

    const result = await messageService.sendTest(userId, phone, message);
    res.json(result);
  }),
};
