import { Response } from 'express';
import { WahaService } from '../../services/waha.service.ts';
import type { AuthRequest } from '../../middleware/auth.ts';
import { asyncHandler } from '../../lib/baseController.ts';

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
    
    let qrCode = null;
    if (status.status === 'SCAN_QR_CODE' || status.status === 'STARTING') {
      const qrResult = await this.service.getQRCode(userId);
      if (qrResult.qr) {
        qrCode = qrResult.qr;
      }
    }
    
    res.json({
      connected: status.connected,
      status: status.status,
      error: status.error,
      phone: status.phone,
      pushName: status.pushName,
      qrCode,
    });
  });

  getQRCode = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    // Primeiro cria/inicia a sessão se não existir
    const startResult = await this.service.createOrStartSession(userId);
    
    if (!startResult.success) {
      res.status(500).json({ error: startResult.error || 'Erro ao iniciar sessão WAHA' });
      return;
    }

    // Se já está conectada, retorna status
    if (startResult.status === 'WORKING') {
      res.json({ qr: null, connected: true, message: 'WhatsApp já conectado!' });
      return;
    }

    // Agora obtém o QR Code
    const result = await this.service.getQRCode(userId);
    
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ qr: result.qr, status: startResult.status });
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
