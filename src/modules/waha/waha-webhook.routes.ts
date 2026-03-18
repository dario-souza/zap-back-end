import { Router, Request, Response } from 'express';
import { sseClients } from '../../lib/sse-clients.ts';
import { supabase } from '../../config/supabase';

const WAHA_URL = process.env.WAHA_URL || 'https://waha1.ux.net.br';
const WAHA_API_KEY = process.env.WAHA_API_KEY || '';

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'X-Api-Key': WAHA_API_KEY,
});

async function fetchQRCode(sessionName: string): Promise<string | null> {
  try {
    const response = await fetch(`${WAHA_URL}/api/${sessionName}/auth/qr`, {
      method: 'GET',
      headers: getHeaders(),
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('image/png')) {
      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      return `data:image/png;base64,${base64}`;
    }

    return null;
  } catch (error) {
    console.error('[WAHA] Erro ao buscar QR:', error);
    return null;
  }
}

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const { event, session, payload } = req.body;

  console.log('[WAHA Webhook] Recebido:', event, session, payload.status);

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

    if (payload.status === 'SCAN_QR_CODE') {
      const qr = await fetchQRCode(session);
      if (qr) {
        sseClients.send(session, 'qr', { qr });
      }
    }

    console.log(`[WAHA] ${session} → ${payload.status}`);
  }

  sseClients.send(session, event, payload);

  res.json({ ok: true });
});

export { router as wahaWebhookRoutes };
