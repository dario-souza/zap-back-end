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
    const status = await this.service.getSessionStatus();
    res.json({
      connected: status.connected,
      status: status.status,
      error: status.error,
    });
  });

  getQRCode = asyncHandler(async (req: AuthRequest, res: Response) => {
    const qrCode = await this.service.getQRCode();
    
    if (!qrCode) {
      res.status(500).json({ error: 'Erro ao obter QR Code. Verifique se a sessão está iniciada.' });
      return;
    }

    res.json({ qr: qrCode });
  });

  startSession = asyncHandler(async (req: AuthRequest, res: Response) => {
    const success = await this.service.startSession();
    
    if (!success) {
      res.status(500).json({ error: 'Erro ao iniciar sessão WAHA' });
      return;
    }

    res.json({ success: true, message: 'Sessão iniciada com sucesso' });
  });

  disconnect = asyncHandler(async (req: AuthRequest, res: Response) => {
    const success = await this.service.logout();
    
    if (!success) {
      res.status(500).json({ error: 'Erro ao desconectar sessão WAHA' });
      return;
    }

    res.json({ success: true, message: 'Sessão desconectada com sucesso' });
  });

  restartSession = asyncHandler(async (req: AuthRequest, res: Response) => {
    const success = await this.service.restartSession();
    
    if (!success) {
      res.status(500).json({ error: 'Erro ao reiniciar sessão WAHA' });
      return;
    }

    res.json({ success: true, message: 'Sessão reiniciada com sucesso' });
  });
}
