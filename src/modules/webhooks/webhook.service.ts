import { supabase } from '../../config/supabase.ts'
import type { WahaWebhookPayload } from './webhook.types.ts'

const extractUserIdFromSession = (sessionName: string): string | null => {
  const match = sessionName.match(/^user_(.+)$/)
  if (!match) return null

  const userIdPart = match[1].replace(/_/g, '-')
  return userIdPart
}

const handleIncomingMessage = async (
  payload: WahaWebhookPayload,
): Promise<void> => {
  const phone = payload.payload.from?.replace('@c.us', '') || ''
  const text = payload.payload.body?.toLowerCase().trim() || ''
  const sessionName = payload.session

  const userId = extractUserIdFromSession(sessionName)
  if (!userId) {
    console.log('[Webhook] UserId não encontrado na sessão:', sessionName)
    return
  }

  const { data: confirmations } = await supabase
    .from('confirmations')
    .select('*')
    .eq('user_id', userId)
    .eq('contact_phone', phone)
    .eq('status', 'PENDING')
    .limit(1)

  if (!confirmations || confirmations.length === 0) {
    console.log('[Webhook] Nenhuma confirmação pendente para:', phone)
    return
  }

  const confirmation = confirmations[0]
  const isConfirmed = ['sim', 's', 'yes', '1'].includes(text)
  const isCancelled = ['não', 'nao', 'n', 'no', '0'].includes(text)

  if (isConfirmed) {
    await supabase
      .from('confirmations')
      .update({
        status: 'CONFIRMED',
        response: text,
        updated_at: new Date().toISOString(),
      })
      .eq('id', confirmation.id)
    console.log('[Webhook] Confirmação aceita para:', phone)
  } else if (isCancelled) {
    await supabase
      .from('confirmations')
      .update({
        status: 'CANCELLED',
        response: text,
        updated_at: new Date().toISOString(),
      })
      .eq('id', confirmation.id)
    console.log('[Webhook] Confirmação cancelada para:', phone)
  }
}

const handleSessionStatus = async (
  payload: WahaWebhookPayload,
): Promise<void> => {
  const sessionName = payload.session
  const status = payload.payload.status

  const userId = extractUserIdFromSession(sessionName)
  if (!userId) {
    console.log('[Webhook] UserId não encontrado na sessão:', sessionName)
    return
  }

  await supabase
    .from('user_sessions')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  console.log('[Webhook] Status da sessão atualizado:', sessionName, status)
}

const handleMessageAck = async (payload: WahaWebhookPayload): Promise<void> => {
  const messageId = payload.payload.id
  const ack = payload.payload.ack

  if (!messageId) return

  const statusMap: Record<number, string> = {
    1: 'SENT',
    2: 'DELIVERED',
    3: 'READ',
  }

  const status = statusMap[ack || 0]
  if (!status) return

  await supabase.from('message_logs').insert({
    message_id: messageId,
    event: status.toLowerCase(),
    waha_message_id: messageId,
    created_at: new Date().toISOString(),
  })

  console.log('[Webhook] ACK atualizado:', messageId, status)
}

export const webhookService = {
  async process(payload: WahaWebhookPayload): Promise<void> {
    switch (payload.event) {
      case 'message':
        await handleIncomingMessage(payload)
        break
      case 'session.status':
        await handleSessionStatus(payload)
        break
      case 'message.ack':
        await handleMessageAck(payload)
        break
    }
  },
}
