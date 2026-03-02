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
}
