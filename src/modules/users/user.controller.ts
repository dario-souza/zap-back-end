import { Response } from 'express';
import { UserService } from './user.service.js';
import type { AuthRequest } from '../../middleware/auth.js';

export class UserController {
  private service: UserService;

  constructor() {
    this.service = new UserService();
  }

  async getProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const profile = await this.service.getProfile(userId);

      if (!profile) {
        res.status(404).json({ error: 'Perfil não encontrado' });
        return;
      }

      res.json(profile);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao buscar perfil' });
    }
  }

  async updateProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const { name } = req.body;

      const profile = await this.service.updateProfile(userId, { name });
      res.json(profile);
    } catch (error) {
      res.status(500).json({ error: 'Erro ao atualizar perfil' });
    }
  }
}
