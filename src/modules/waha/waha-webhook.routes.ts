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

    const data = await response.json()
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

  if (event === 'message.any') {
    const userId = extractUserIdFromSession(sessionName)
    console.log('[WAHA] message.any — fromMe:', payload.fromMe, '| userId:', userId, '| body:', payload.body)

    if (!userId) {
      console.log('[WAHA] userId null, ignorando')
      res.json({ ok: true })
      return
    }

    // Ignorar mensagens enviadas pelo próprio usuário (fromMe: true)
    // Apenas processar mensagens recebidas (fromMe: false) que são respostas dos contatos
    if (payload.fromMe === true) {
      console.log('[WAHA] Mensagem enviada pelo usuário, ignorando')
      res.json({ ok: true })
      return
    }

    // Phone que veio do WAHA
    const rawPhone = payload.from?.replace('@c.us', '').replace('@lid', '') || ''
    let phone = rawPhone.replace(/\D/g, '')

    // Se o phone veio no formato @lid (ID do WhatsApp), precisamos resolver para o número real
    if (payload.from?.includes('@lid')) {
      console.log('[WAHA] Detectado formato @lid, buscando número real...')
      try {
        const contactInfo = await resolveLidToPhone(sessionName, payload.from)
        if (contactInfo?.phone) {
          phone = contactInfo.phone.replace(/\D/g, '')
          console.log('[WAHA] Número resolvedo via API:', phone)
        }
      } catch (err) {
        console.error('[WAHA] Erro ao resolver lid:', err)
      }
    }

    const texto = payload.body?.toLowerCase().trim() || ''

    console.log('[WAHA] phone raw do WAHA:', rawPhone)
    console.log('[WAHA] phone normalizado do WAHA:', phone)

    const { data: confirmations } = await supabase
      .from('confirmations')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    console.log('[WAHA] confirmações pendentes:', confirmations?.length)
    if (confirmations && confirmations.length > 0) {
    console.log('[WAHA] phones no banco:', confirmations.map(c => c.contact_phone.replace(/\D/g, '')))
    }

    // Função para normalizar telefone para comparação
    const normalizePhone = (p: string) => p.replace(/\D/g, '')
    
    // Buscar confirmação pelo phone normalizado (comparação flexível)
    const confirmation = confirmations?.find(c => {
      const bankPhone = normalizePhone(c.contact_phone)
      // Verificar se algum contém o outro (para números que podem ter formato diferente)
      return bankPhone.includes(phone) || phone.includes(bankPhone)
    })

    if (!confirmation) {
      console.log('[WAHA] nenhuma confirmação encontrada para phone:', phone)
      res.json({ ok: true })
      return
    }

    let novoStatus: string | null = null
    if (RESPOSTAS_SIM.includes(texto)) novoStatus = 'confirmed'
    if (RESPOSTAS_NAO.includes(texto)) novoStatus = 'cancelled'

    console.log('[WAHA] texto reconheceu:', novoStatus || 'nenhum')

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

      console.log(`[WAHA] ATUALIZADO ${novoStatus}: phone=${phone} | texto="${texto}"`)
    }
  }

  if (event === 'message.ack') {
    const waMessageId = payload.id
    const ack = payload.ack as number

    if (!waMessageId) {
      res.json({ ok: true })
      return
    }

    const { data: confirmation } = await supabase
      .from('confirmations')
      .select('id, user_id')
      .eq('wa_message_id', waMessageId)
      .maybeSingle()

    if (confirmation) {
      let newStatus: string = 'sent'
      if (ack === 1) newStatus = 'sent'
      else if (ack === 2) newStatus = 'delivered'
      else if (ack >= 3) newStatus = 'read'

      await supabase
        .from('confirmations')
        .update({ message_status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', confirmation.id)

      console.log(`[WAHA Webhook] message.ack: waId=${waMessageId} ack=${ack} → ${newStatus}`)
    }
  }

  res.json({ ok: true });
});

export { router as wahaWebhookRoutes };
