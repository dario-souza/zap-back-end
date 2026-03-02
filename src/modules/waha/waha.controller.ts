import { Response } from 'express';
import { WahaService } from '../../services/waha.service.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { asyncHandler } from '../../lib/baseController.js';

export class WahaController {
  private service: WahaService;

  constructor() {
    this.service = new WahaService();
  }

  getStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const status = await this.service.getSessionStatus(userId);
    res.json({
      connected: status.connected,
      status: status.status,
      error: status.error,
      phone: status.phone,
      pushName: status.pushName,
    });
  });

  getQRCode = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const result = await this.service.getQRCode(userId);
    
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ qr: result.qr });
  });

  startSession = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const result = await this.service.createOrStartSession(userId);
    
    if (!result.success) {
      res.status(500).json({ error: result.error || 'Erro ao iniciar sessão WAHA' });
      return;
    }

    res.json({ 
      success: true, 
      status: result.status,
      message: result.status === 'WORKING' 
        ? 'Sessão já está conectada!' 
        : 'Sessão iniciada! Escaneie o QR Code.'
    });
  });

  disconnect = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    const result = await this.service.disconnect(userId);
    
    if (!result.success) {
      res.status(500).json({ error: result.error || 'Erro ao desconectar sessão WAHA' });
      return;
    }

    res.json({ success: true, message: 'Sessão desconectada com sucesso' });
  });
}
