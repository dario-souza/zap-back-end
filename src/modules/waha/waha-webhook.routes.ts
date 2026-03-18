import { Router, Request, Response } from 'express';
import { sseClients } from '../../lib/sse-clients.ts';
import { supabase } from '../../config/supabase';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
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

export { router as wahaWebhookRoutes };
