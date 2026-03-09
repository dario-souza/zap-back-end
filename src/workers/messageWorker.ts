import { Worker, Job } from 'bullmq'
import { supabase } from '../config/supabase.ts'
import { wahaService } from '../services/waha.service.ts'
import { redisConnection } from '../config/redis.ts'

const WHATSAPP_MIN_DELAY_BETWEEN_MESSAGES = parseInt(process.env.WHATSAPP_MIN_DELAY_BETWEEN_MESSAGES || '2000')
const WHATSAPP_MAX_DELAY_BETWEEN_MESSAGES = parseInt(process.env.WHATSAPP_MAX_DELAY_BETWEEN_MESSAGES || '5000')
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '10')

const replaceVariables = (content: string, contact: { name?: string; phone?: string } | null): string => {
  if (!contact) return content
  
  let result = content
  
  result = result.replace(/\{\{nome\}\}/gi, contact.name || '')
  result = result.replace(/\{\{name\}\}/gi, contact.name || '')
  result = result.replace(/\{\{phone\}\}/gi, contact.phone || '')
  result = result.replace(/\{\{telefone\}\}/gi, contact.phone || '')
  
  return result
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const getRandomDelay = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

interface SendMessageJobData {
  messageId?: string
  phone: string
  content: string
  userId: string
  contactId?: string
  scheduledAt?: string
}

let worker: Worker | null = null

const userDelays = new Map<string, number>()

const canSendMessage = (userId: string): boolean => {
  const lastSend = userDelays.get(userId)
  if (!lastSend) return true
  
  const now = Date.now()
  const timeSinceLastSend = now - lastSend
  const minDelay = WHATSAPP_MIN_DELAY_BETWEEN_MESSAGES
  
  return timeSinceLastSend >= minDelay
}

const getWaitTime = (userId: string): number => {
  const lastSend = userDelays.get(userId)
  if (!lastSend) return 0
  
  const now = Date.now()
  const timeSinceLastSend = now - lastSend
  const waitTime = WHATSAPP_MIN_DELAY_BETWEEN_MESSAGES - timeSinceLastSend
  
  return Math.max(0, waitTime)
}

const startWorker = async () => {
  try {
    console.log('[Worker] Iniciando worker de mensagens...')
    console.log(`[Worker] Configuração: delay ${WHATSAPP_MIN_DELAY_BETWEEN_MESSAGES}-${WHATSAPP_MAX_DELAY_BETWEEN_MESSAGES}ms entre msgs, concorrência: ${WORKER_CONCURRENCY}`)

    worker = new Worker(
      'message-queue',
      async (job: Job<SendMessageJobData>) => {
        const { messageId, phone, content, userId, contactId, scheduledAt } = job.data
        
        const waitTime = getWaitTime(userId)
        if (waitTime > 0) {
          console.log(`[Worker] Usuário ${userId.substring(0, 8)} em espera, aguardando ${waitTime}ms`)
          await sleep(waitTime)
        }
        
        console.log(`[Worker] Enviando mensagem para ${phone} (usuário: ${userId.substring(0, 8)})`)

        try {
          let finalContent = content
          
          if (contactId) {
            const { data: contact } = await supabase
              .from('contacts')
              .select('name, phone')
              .eq('id', contactId)
              .single()
            
            if (contact) {
              finalContent = replaceVariables(content, contact)
              console.log(`[Worker] Mensagem com variáveis substituídas: "${finalContent}"`)
            }
          }

          await sleep(getRandomDelay(WHATSAPP_MIN_DELAY_BETWEEN_MESSAGES, WHATSAPP_MAX_DELAY_BETWEEN_MESSAGES))

          const result = await wahaService.sendMessage(userId, phone, finalContent)

          userDelays.set(userId, Date.now())

          if (result.success && result.messageId) {
            if (messageId) {
              const { data: message, error } = await supabase
                .from('messages')
                .update({
                  status: 'SENT',
                  sent_at: new Date().toISOString(),
                  wa_message_id: result.messageId,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', messageId)
                .eq('user_id', userId)
                .select()
                .single()

              if (error) {
                console.error('[Worker] Erro ao atualizar mensagem:', error)
              } else {
                console.log(`[Worker] Mensagem atualizada com ID: ${message?.id}, WAHA ID: ${result.messageId}`)
              }
            } else {
              const { data: message, error } = await supabase
                .from('messages')
                .insert({
                  user_id: userId,
                  phone: phone.replace('@c.us', '').replace('@g.us', ''),
                  content: finalContent,
                  status: 'SENT',
                  sent_at: new Date().toISOString(),
                  scheduled_at: scheduledAt || null,
                  contact_id: contactId || null,
                  wa_message_id: result.messageId,
                })
                .select()
                .single()

              if (error) {
                console.error('[Worker] Erro ao salvar mensagem:', error)
                throw new Error('Falha ao salvar mensagem no banco')
              }

              console.log(`[Worker] Mensagem salva com ID: ${message?.id}, WAHA ID: ${result.messageId}`)
            }
          } else {
            console.error('[Worker] Falha ao enviar via WAHA:', result.error)
            throw new Error(result.error || 'Falha ao enviar mensagem')
          }
        } catch (error) {
          console.error(`[Worker] Erro ao enviar mensagem para ${phone}:`, error)
          throw error
        }
      },
      {
        connection: redisConnection as any,
        concurrency: WORKER_CONCURRENCY,
      },
    )

    worker.on('completed', (job) => {
      console.log(`[Worker] Job ${job.id} concluído`)
    })

    worker.on('failed', (job, err) => {
      console.error(`[Worker] Job ${job?.id} falhou:`, err.message)
    })

    worker.on('error', (err) => {
      console.error('[Worker] Erro no worker:', err.message)
    })

    console.log('[Worker] Worker de mensagens iniciado')
  } catch (error) {
    console.log('[Worker] Redis não disponível, worker não iniciado:', error)
  }
}

startWorker()

export const stopWorker = async () => {
  if (worker) {
    await worker.close()
    console.log('[Worker] Worker de mensagens parado')
  }
}

export default worker
