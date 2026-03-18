import { Router, Request, Response } from 'express';
import { WahaController } from './waha.controller.ts';
import { authenticate, type AuthRequest } from '../../middleware/auth.ts';
import { sseClients } from '../../lib/sse-clients.ts';
import { whatsappService } from '../../integrations/whatsapp/whatsapp.service';
import { supabase } from '../../config/supabase';

const router = Router();

// Webhook não precisa de autenticação - é chamado pelo WAHA
router.post('/webhook', async (req: Request, res: Response) => {
  const { event, session, payload } = req.body;

  console.log('[WAHA Webhook] Recebido:', event, session);

  if (event === 'session.status' && payload.status) {
    const { data: userSession } = await supabase
      .from('user_sessions')
      .select('user_id')
      .eq('session_name', session)
      .single();

    if (userSession) {
      await supabase
        .from('user_sessions')
        .update({
          status: payload.status,
          phone: payload.phone,
          push_name: payload.pushName,
          connected_at: payload.status === 'WORKING' ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('session_name', session);
    }

    console.log(`[WAHA] ${session} → ${payload.status}`);
  }

  if (event === 'qr' && payload.qr) {
    sseClients.send(session, 'qr', { qr: payload.qr });
  }

  sseClients.send(session, event, payload);

  res.json({ ok: true });
});

const controller = new WahaController();

router.use(authenticate);

router.get('/session/status', controller.getStatus);
router.get('/session/qr', controller.getQRCode);
router.post('/session/start', controller.startSession);
router.post('/session/disconnect', controller.disconnect);

router.get('/sse/:session', (req: Request, res: Response) => {
  const { session } = req.params;
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;

  if (!userId) {
    res.status(401).json({ error: 'Usuário não autenticado' });
    return;
  }

  const expectedSessionName = whatsappService.getSessionName(userId);
  if (session !== expectedSessionName) {
    res.status(403).json({ error: 'Sessão não pertence ao usuário' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(session, res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.remove(session, res);
  });
});

export { router as wahaRoutes };
