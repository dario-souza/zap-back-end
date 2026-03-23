import { Router, Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { sendSseEvent } from '../sessions/sseStore';
import { whatsappService } from '../../integrations/whatsapp/whatsapp.service';

const router = Router();

const RESPOSTAS_SIM = ['sim', 's', 'yes', '1', 'confirmo', 'confirmado', 'vou', 'estarei']
const RESPOSTAS_NAO = ['não', 'nao', 'n', 'no', '0', 'cancela', 'cancelado', 'nao vou']

const extractUserIdFromSession = (sessionName: string): string | null => {
  if (!sessionName || !sessionName.startsWith('user_')) return null
  const uuid = sessionName.replace(/^user_/, '')
  return uuid.replace(/_/g, '-')
}

const WAHA_URL = process.env.WAHA_URL || 'https://waha1.ux.net.br'
const WAHA_API_KEY = process.env.WAHA_API_KEY || ''

async function resolveLidToPhone(sessionName: string, lid: string): Promise<{ phone?: string; lid?: string } | null> {
  try {
    // Escapar @ para %40 ou usar só o número
    const lidNumber = lid.replace('@lid', '').replace('@c.us', '')
    
    const response = await fetch(
      `${WAHA_URL}/api/${sessionName}/lids/${lidNumber}`,
      {
        method: 'GET',
        headers: {
          'X-Api-Key': WAHA_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      console.error('[WAHA] Erro ao buscar lid:', await response.text())
      return null
    }

    const data = await response.json() as { pn?: string; lid?: string }
    console.log('[WAHA] Dados do LID:', JSON.stringify(data))
    
    // O endpoint retorna { lid, pn } onde pn é o phone com @c.us
    return {
      phone: data.pn?.replace('@c.us', '').replace('@lid', ''),
      lid: data.lid,
    }
  } catch (error) {
    console.error('[WAHA] Erro na requisição de lid:', error)
    return null
  }
}

router.post('/', async (req: Request, res: Response) => {
  const { event, session: sessionName, payload } = req.body;

  console.log('[WAHA Webhook] Recebido:', event, sessionName);

  if (event === 'session.status' && payload.status) {
    const { data: userSession } = await supabase
      .from('user_sessions')
      .select('user_id')
      .eq('session_name', sessionName)
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
        .eq('session_name', sessionName);
    }

    console.log(`[WAHA] ${sessionName} → ${payload.status}`);

    if (payload.status === 'SCAN_QR_CODE') {
      const userId = userSession?.user_id
      if (userId) {
        try {
          const qrResult = await whatsappService.getQRCode(userId)
          if (qrResult.qr) {
            sendSseEvent(sessionName, 'qr', { qr: qrResult.qr })
            sendSseEvent(sessionName, 'status', { status: 'SCAN_QR_CODE' })
          }
        } catch (err) {
          console.error('[WAHA Webhook] Erro ao buscar QR:', err)
        }
      }
    }

    if (payload.status === 'WORKING') {
      sendSseEvent(sessionName, 'conectado', { status: 'WORKING' })
    }

    if (payload.status === 'FAILED') {
      sendSseEvent(sessionName, 'falha', { mensagem: 'Sessão falhou. Reinicie ou faça logout.' })
    }
  }

  // Evento 'message' - só recebe mensagens de outros (não as que você envia)
  // Este evento substitui 'message.any' para economizarwebhook calls
  if (event === 'message') {
    const userId = extractUserIdFromSession(sessionName)

    if (!userId) {
      res.json({ ok: true })
      return
    }

    const texto = payload.body?.toLowerCase().trim() || ''
    let phone = ''

    // Phone que veio do WAHA
    if (payload.from?.includes('@lid')) {
      // Formato LID - preciso resolver para obter o número
      try {
        const contactInfo = await resolveLidToPhone(sessionName, payload.from)
        if (contactInfo?.phone) {
          phone = contactInfo.phone.replace(/\D/g, '')
        }
      } catch (err) {
        console.error('[WAHA] Erro ao resolver lid:', err)
      }
    } else {
      // Formato normal - extrair número do @c.us
      phone = payload.from?.replace('@c.us', '').replace('@lid', '').replace(/\D/g, '') || ''
    }

    if (!phone) {
      console.log('[WAHA] Não foi possível extrair phone da mensagem')
      res.json({ ok: true })
      return
    }

    // Buscar confirmações pendentes que ainda não expiraram
    const { data: confirmations } = await supabase
      .from('confirmations')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: false })

    if (!confirmations || confirmations.length === 0) {
      res.json({ ok: true })
      return
    }

    // Buscar confirmação pelo phone
    const confirmation = confirmations.find(c => {
      const bankPhone = c.contact_phone.replace(/\D/g, '')
      return bankPhone.includes(phone) || phone.includes(bankPhone)
    })

    if (!confirmation) {
      res.json({ ok: true })
      return
    }

    // Verificar se já expirou
    if (confirmation.expires_at && new Date(confirmation.expires_at) < new Date()) {
      res.json({ ok: true })
      return
    }

    let novoStatus: string | null = null
    if (RESPOSTAS_SIM.includes(texto)) novoStatus = 'confirmed'
    if (RESPOSTAS_NAO.includes(texto)) novoStatus = 'cancelled'

    if (novoStatus) {
      await supabase
        .from('confirmations')
        .update({
          status: novoStatus,
          response: payload.body,
          responded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', confirmation.id)

      console.log(`[WAHA] ✓ ${confirmation.contact_name}: ${novoStatus} ("${texto}")`)
    }
  }

  res.json({ ok: true });
});

export { router as wahaWebhookRoutes };
