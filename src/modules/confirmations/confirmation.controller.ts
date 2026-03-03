import { Response } from 'express';
import { ConfirmationService } from './confirmation.service.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { asyncHandler } from '../../lib/baseController.js';

export class ConfirmationController {
  private service: ConfirmationService;

  constructor() {
    this.service = new ConfirmationService();
  }

  getAll = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const confirmations = await this.service.getAll(userId);
    res.json(confirmations);
  });

  create = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const { contactName, contactPhone, eventDate, messageContent } = req.body;
    if (!contactName || !contactPhone || !eventDate) {
      res.status(400).json({ error: 'Nome do contato, telefone e data do evento são obrigatórios' });
      return;
    }

    const confirmation = await this.service.create(userId, contactName, contactPhone, eventDate, messageContent);
    res.status(201).json(confirmation);
  });

  update = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const { id } = req.params;
    const { status, response } = req.body;

    if (!status || !['CONFIRMED', 'DENIED'].includes(status)) {
      res.status(400).json({ error: 'Status inválido' });
      return;
    }

    const confirmation = await this.service.update(userId, id, status, response);
    res.json(confirmation);
  });

  delete = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const { id } = req.params;
    await this.service.delete(userId, id);
    res.json({ success: true });
  });
}
