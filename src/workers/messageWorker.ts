import { Worker, Job } from 'bullmq'
import { supabase } from '../config/supabase.ts'
import { wahaService } from '../services/waha.service.ts'
import { redisConnection } from '../config/redis.ts'

const replaceVariables = (content: string, contact: { name?: string; phone?: string } | null): string => {
  if (!contact) return content
  
  let result = content
  
  result = result.replace(/\{\{nome\}\}/gi, contact.name || '')
  result = result.replace(/\{\{name\}\}/gi, contact.name || '')
  result = result.replace(/\{\{phone\}\}/gi, contact.phone || '')
  result = result.replace(/\{\{telefone\}\}/gi, contact.phone || '')
  
  return result
}

interface SendMessageJobData {
  phone: string
  content: string
  userId: string
  contactId?: string
  scheduledAt?: string
}

let worker: Worker | null = null

const startWorker = async () => {
  try {
    console.log('[Worker] Iniciando worker de mensagens...')

    worker = new Worker(
      'message-queue',
      async (job: Job<SendMessageJobData>) => {
        const { phone, content, userId, contactId, scheduledAt } = job.data
        console.log(`[Worker] Enviando mensagem para ${phone}`)

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

          const result = await wahaService.sendMessage(userId, phone, finalContent)

          if (result.success && result.messageId) {
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

            console.log(`[Worker] Mensagem enviada e salva com ID: ${message?.id}, WAHA ID: ${result.messageId}`)
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
        concurrency: 5,
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
