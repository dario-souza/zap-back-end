import { Response } from 'express';
import { TemplateService } from './template.service.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { asyncHandler } from '../../lib/baseController.js';

export class TemplateController {
  private service: TemplateService;

  constructor() {
    this.service = new TemplateService();
  }

  getAll = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const templates = await this.service.getAll(userId);
    res.json(templates);
  });

  create = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const { name, content } = req.body;
    if (!name || !content) {
      res.status(400).json({ error: 'Nome e conteúdo são obrigatórios' });
      return;
    }

    const template = await this.service.create(userId, name, content);
    res.status(201).json(template);
  });

  update = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const { id } = req.params;
    const { name, content } = req.body;

    const template = await this.service.update(userId, id, name, content);
    res.json(template);
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

  deleteAll = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    await this.service.deleteAll(userId);
    res.json({ success: true });
  });
}
