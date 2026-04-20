import { Router, Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { sendSseEvent } from '../sessions/sseStore';
import { whatsappService } from '../../integrations/whatsapp/whatsapp.service';

const router = Router();

const RESPOSTAS_SIM = ['sim', 's', 'yes', '1', 'confirmo', 'confirmado', 'vou', 'estarei']
const RESPOSTAS_NAO = ['não', 'nao', 'n', 'no', '0', 'cancela', 'cancelado', 'nao vou']

const incrementUserStats = async (userId: string): Promise<void> => {
  // Primeiro tenta atualizar, se não existir cria
  const { data: existing } = await supabase
    .from('user_stats')
    .select('total_sent')
    .eq('user_id', userId)
    .single()

  if (existing) {
    await supabase
      .from('user_stats')
      .update({ total_sent: existing.total_sent + 1, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
  } else {
    await supabase
      .from('user_stats')
      .insert({ user_id: userId, total_sent: 1 })
  }
}

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

async function sendAutomaticResponse(
  sessionName: string,
  phone: string,
  confirmation: any,
  status: string
): Promise<void> {
  const responseMessage = status === 'confirmed' 
    ? confirmation.confirmation_response_message 
    : confirmation.cancellation_response_message

  if (!responseMessage) {
    console.log('[WAHA] Nenhuma mensagem de resposta automática configurada')
    return
  }

  // Substituir variáveis na mensagem
  let finalMessage = responseMessage
  finalMessage = finalMessage.replace(/\{\{contact_name\}\}/gi, confirmation.contact_name || '')
  finalMessage = finalMessage.replace(/\{\{nome\}\}/gi, confirmation.contact_name || '')
  finalMessage = finalMessage.replace(
    /\{\{event_date\}\}/gi,
    confirmation.event_date
      ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(confirmation.event_date))
      : ''
  )

  // Enviar mensagem com delay humano
  const humanDelay = Math.floor(Math.random() * 2000) + 1000
  await new Promise(resolve => setTimeout(resolve, humanDelay))

  const result = await whatsappService.send(sessionName, phone, finalMessage)
  
  if (result.success) {
    console.log(`[WAHA] ✓ Mensagem de resposta automática enviada para ${phone}`)
    // Incrementa o contador total de mensagens enviadas
    await incrementUserStats(confirmation.user_id)
  } else {
    console.error(`[WAHA] Erro ao enviar mensagem de resposta: ${result.error}`)
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

  // Evento 'poll.vote' - usuário votou em uma opção do poll
  if (event === 'poll.vote') {
    const userId = extractUserIdFromSession(sessionName)
    if (!userId) {
      res.json({ ok: true })
      return
    }

    const vote = payload.vote
    const poll = payload.poll

    // Verificar se é um poll nosso (fromMe = true)
    if (!poll?.fromMe) {
      console.log('[WAHA] Poll não enviado por nós, ignorando')
      res.json({ ok: true })
      return
    }

    const selectedOptions = vote?.selectedOptions || []
    
    // Extrair phone - verificar se é formato LID (precisa resolver via API) ou formato normal
    let phone = ''
    if (vote?.from?.includes('@lid')) {
      try {
        const contactInfo = await resolveLidToPhone(sessionName, vote.from)
        if (contactInfo?.phone) {
          phone = contactInfo.phone.replace(/\D/g, '')
        }
      } catch (err) {
        console.error('[WAHA] Erro ao resolver lid do voto:', err)
      }
    } else {
      // Formato normal - extrair número do @c.us
      phone = vote?.from?.replace('@c.us', '').replace('@lid', '').replace(/\D/g, '') || ''
    }

    if (!phone || selectedOptions.length === 0) {
      console.log('[WAHA] Poll sem phone ou opções selecionadas')
      res.json({ ok: true })
      return
    }

    console.log(`[WAHA] Voto recebido de ${phone}:`, selectedOptions)

    // Buscar confirmações pendentes
    const { data: confirmations } = await supabase
      .from('confirmations')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (!confirmations || confirmations.length === 0) {
      res.json({ ok: true })
      return
    }

    // Buscar confirmação pelo phone
    const confirmation = confirmations.find(c => {
      const confirmPhone = c.contact_phone.replace(/\D/g, '')
      return confirmPhone.includes(phone) || phone.includes(confirmPhone)
    })

    if (!confirmation) {
      res.json({ ok: true })
      return
    }

    // Mapear opção selecionada para status
    let novoStatus: string | null = null
    const option = selectedOptions[0]?.toLowerCase()

    if (option === 'sim') {
      novoStatus = 'confirmed'
    } else if (option === 'não' || option === 'nao') {
      novoStatus = 'cancelled'
    }

    if (novoStatus) {
      await supabase
        .from('confirmations')
        .update({
          status: novoStatus,
          response: selectedOptions.join(', '),
          responded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', confirmation.id)

      console.log(`[WAHA] ✓ ${confirmation.contact_name}: ${novoStatus} (voto: ${selectedOptions[0]})`)

      // Enviar mensagem de resposta automática
      await sendAutomaticResponse(sessionName, phone, confirmation, novoStatus)
    }
  }

  // Evento 'poll.vote.failed' - falha ao descriptografar o voto
  if (event === 'poll.vote.failed') {
    const userId = extractUserIdFromSession(sessionName)
    if (!userId) {
      res.json({ ok: true })
      return
    }

    const vote = payload.vote
    const poll = payload.poll

    // Verificar se é um poll nosso
    if (!poll?.fromMe) {
      res.json({ ok: true })
      return
    }

    // Extrair phone - verificar se é formato LID (precisa resolver via API) ou formato normal
    let phone = ''
    if (vote?.from?.includes('@lid')) {
      try {
        const contactInfo = await resolveLidToPhone(sessionName, vote.from)
        if (contactInfo?.phone) {
          phone = contactInfo.phone.replace(/\D/g, '')
        }
      } catch (err) {
        console.error('[WAHA] Erro ao resolver lid do voto falho:', err)
      }
    } else {
      // Formato normal - extrair número do @c.us
      phone = vote?.from?.replace('@c.us', '').replace('@lid', '').replace(/\D/g, '') || ''
    }

    if (!phone) {
      res.json({ ok: true })
      return
    }

    console.log(`[WAHA] Falha ao descriptografar voto de ${phone}`)

    // Buscar confirmações pendentes
    const { data: confirmations } = await supabase
      .from('confirmations')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (!confirmations || confirmations.length === 0) {
      res.json({ ok: true })
      return
    }

    // Buscar confirmação pelo phone
    const confirmation = confirmations.find(c => {
      const confirmPhone = c.contact_phone.replace(/\D/g, '')
      return confirmPhone.includes(phone) || phone.includes(confirmPhone)
    })

    if (!confirmation) {
      res.json({ ok: true })
      return
    }

    // Atualizar status para failed - usuário precisará votar novamente manualmente
    await supabase
      .from('confirmations')
      .update({
        status: 'pending', // mantém pending mas poderíamos marcar como special status
        response: 'FALHA_DESCRIPTOGRAFIA',
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', confirmation.id)

    console.log(`[WAHA] ⚠ ${confirmation.contact_name}: falha na descriptografia do voto`)
  }

  res.json({ ok: true });
});

export { router as wahaWebhookRoutes };
