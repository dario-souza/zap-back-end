import { Router } from 'express';
import { webhookController } from '../controllers/webhook.ts';

const router = Router();

// Rota para receber webhooks da WAHA - SEM autenticação (chamada pela API externa)
router.post('/waha', webhookController.handleWAHAWebhook);

// Rota para health check do webhook - protegida opcionalmente
router.get('/health', webhookController.healthCheck);

// Rota para visualizar eventos recentes (debugging) - proteger em produção
router.get('/events', webhookController.getRecentEvents);

export default router;
