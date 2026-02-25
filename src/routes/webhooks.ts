import { Router } from 'express';
import { webhookController } from '../controllers/webhook.ts';
import { wahaService } from '../services/waha.ts';
import { prisma } from '../lib/prisma.ts';
import { authMiddleware } from '../middlewares/auth.ts';
import type { AuthRequest } from '../middlewares/auth.ts';
import type { Response } from 'express';

const router = Router();

// Rota para receber webhooks da WAHA - SEM autenticação (chamada pela API externa)
router.post('/waha', webhookController.handleWAHAWebhook);

// Rota para health check do webhook
router.get('/health', webhookController.healthCheck);

// Rota para visualizar eventos recentes (debugging)
router.get('/events', webhookController.getRecentEvents);

// Endpoint de teste para verificar se webhook está configurado corretamente (PROTEGIDO)
router.get('/test', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const webhookUrl = process.env.WAHA_WEBHOOK_URL;
    
    if (!webhookUrl) {
      return res.status(500).json({ 
        error: 'WAHA_WEBHOOK_URL não configurada',
        configured: false 
      });
    }

    // Busca todas as sessões do usuário no banco
    const userId = req.user?.id;
    let sessions: any[] = [];
    
    if (userId) {
      sessions = await prisma.whatsAppSession.findMany({
        where: { userId },
      });
    }

    res.json({
      webhookUrl,
      configured: true,
      sessions,
      message: 'Webhook configurado. Para testar: desconecte e reconecte o WhatsApp e verifique os eventos em /api/webhooks/events'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para forçar atualização do webhook na sessão WAHA (PROTEGIDO)
router.post('/setup-webhook', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sessionName = wahaService.generateSessionName(userId);
    const webhookUrl = process.env.WAHA_WEBHOOK_URL;

    if (!webhookUrl) {
      return res.status(500).json({ error: 'WAHA_WEBHOOK_URL não configurada' });
    }

    // Configura o webhook na sessão WAHA
    const session = await wahaService.configureWebhook(sessionName, webhookUrl);
    
    res.json({
      success: true,
      session: sessionName,
      webhookConfigured: true,
      message: 'Webhook configurado com sucesso na sessão WAHA'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
