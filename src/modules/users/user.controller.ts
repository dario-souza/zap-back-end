import { Response } from 'express';
import { userService } from './user.service.ts';
import type { AuthRequest } from '../../middleware/auth.ts';
import { asyncHandler, getUserId } from '../../lib/baseController.ts';

export const userController = {
  getProfile: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    const profile = await userService.getProfile(userId);

    if (!profile) {
      res.status(404).json({ error: 'Perfil não encontrado' });
      return;
    }

    res.json(profile);
  }),

  updateProfile: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req);
    const { name } = req.body;

    const profile = await userService.updateProfile(userId, { name });
    res.json(profile);
  }),
};
