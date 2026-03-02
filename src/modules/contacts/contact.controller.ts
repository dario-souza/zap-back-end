import { Response } from 'express';
import { ContactService } from './contact.service.js';
import type { AuthRequest } from '../../middleware/auth.js';
import type { CreateContactInput, UpdateContactInput } from './contact.types.js';
import { asyncHandler, getUserId } from '../../lib/baseController.js';

export class ContactController {
  private service: ContactService;

  constructor() {
    this.service = new ContactService();
  }

  getAll = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    const contacts = await this.service.getAll(userId);
    res.json(contacts);
  });

  getById = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    const { id } = req.params;
    const contact = await this.service.getById(id, userId);

    if (!contact) {
      res.status(404).json({ error: 'Contato não encontrado' });
      return;
    }

    res.json(contact);
  });

  create = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    const input: CreateContactInput = req.body;
    const contact = await this.service.create(userId, input);
    res.status(201).json(contact);
  });

  update = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    const { id } = req.params;
    const input: UpdateContactInput = req.body;
    const contact = await this.service.update(id, userId, input);
    res.json(contact);
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
}
