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
    // Primeiro garante que a sessão existe e está iniciada
    await this.service.createOrStartSession();
    
    const qrCode = await this.service.getQRCode();
    
    if (!qrCode) {
      res.status(400).json({ 
        error: 'QR Code não disponível. A sessão pode estar em processo de conexão ou não existe.',
        hint: 'Tente iniciar a sessão primeiro.'
      });
      return;
    }

    res.json({ qr: qrCode });
  });

  startSession = asyncHandler(async (req: AuthRequest, res: Response) => {
    const result = await this.service.createOrStartSession();
    
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
