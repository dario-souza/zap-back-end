import { Response } from 'express';
import { UserService } from './user.service.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { asyncHandler, getUserId } from '../../lib/baseController.js';

export class UserController {
  private service: UserService;

  constructor() {
    this.service = new UserService();
  }

  getProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    const profile = await this.service.getProfile(userId);

    if (!profile) {
      res.status(404).json({ error: 'Perfil não encontrado' });
      return;
    }

    res.json(profile);
  });

  updateProfile = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    const { name } = req.body;

    const profile = await this.service.updateProfile(userId, { name });
    res.json(profile);
  });
}
