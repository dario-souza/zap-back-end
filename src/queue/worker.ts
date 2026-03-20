import { Worker, Job } from 'bullmq'
import { whatsappService } from '../integrations/whatsapp/whatsapp.service.ts'
import { redisConnection } from '../config/redis.ts'
import { messageRepository } from '../modules/messages/message.repository.ts'
import { contactRepository } from '../modules/contacts/contact.repository.ts'
import { messageLogRepository } from '../modules/messages/message-log.repository.ts'
import { calculateNextSendAt } from '../shared/utils/calcNextRun.ts'
import type { JobPayload } from './job.types.ts'

const WHATSAPP_MIN_DELAY = 2000
const WHATSAPP_MAX_DELAY = 5000

const replaceVariables = (
  content: string,
  contact: { name?: string; phone?: string; email?: string } | null,
): string => {
  if (!contact) return content

  let result = content
  result = result.replace(/\{\{nome\}\}/gi, contact.name || '')
  result = result.replace(/\{\{name\}\}/gi, contact.name || '')
  result = result.replace(/\{\{phone\}\}/gi, contact.phone || '')
  result = result.replace(/\{\{telefone\}\}/gi, contact.phone || '')
  result = result.replace(/\{\{email\}\}/gi, contact.email || '')

  return result
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const getRandomDelay = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

let worker: Worker | null = null

export const messageWorker = {
  start: async () => {
    try {
      console.log('[Worker] Iniciando worker...')
      console.log(
        `[Worker] Delay: ${WHATSAPP_MIN_DELAY}-${WHATSAPP_MAX_DELAY}ms`,
      )
      console.log(`[Worker] Fila: messages`)

      worker = new Worker<JobPayload>(
        'messages',
        async (job: Job<JobPayload>) => {
          console.log(`[Worker] Job ${job.id} - Tipo: ${job.name}`)

          const data = job.data
          const { messageId, phone, content, userId, sessionName, contactId, recurrenceCron } =
            data

          const humanDelay = getRandomDelay(
            WHATSAPP_MIN_DELAY,
            WHATSAPP_MAX_DELAY,
          )
          console.log(
            `[Worker] Delay humano: ${humanDelay}ms para user ${userId.substring(0, 8)}`,
          )
          await sleep(humanDelay)

          let finalContent = content

          if (contactId) {
            const contact = await contactRepository.findById(contactId, userId)
            if (contact) {
              finalContent = replaceVariables(content, contact)
            }
          }

          console.log(`[Worker] Enviando para ${phone}`)
          const result = await whatsappService.send(
            sessionName,
            phone,
            finalContent,
          )

          if (result.success && result.id) {
            if (messageId) {
              await messageRepository.updateStatus(messageId, userId, 'sent')
              await messageRepository.updateWaMessageId(messageId, userId, result.id)
              await messageLogRepository.create({
                messageId,
                userId,
                event: 'sent',
                wahaMessageId: result.id,
              })

              if (recurrenceCron) {
                const nextSendAt = calculateNextSendAt(recurrenceCron)
                await messageRepository.updateNextSendAt(messageId, userId, nextSendAt.toISOString())
              }
            }
            console.log(`[Worker] Sucesso! WAHA ID: ${result.id}`)
            return { success: true, waMessageId: result.id }
          } else {
            console.error(`[Worker] Falha: ${result.error}`)
            if (messageId) {
              await messageRepository.updateStatus(messageId, userId, 'failed')
              await messageLogRepository.create({
                messageId,
                userId,
                event: 'failed',
                metadata: { error: result.error },
              })
            }
            throw new Error(result.error || 'Falha ao enviar')
          }
        },
        {
          connection: redisConnection as any,
          concurrency: 1,
        },
      )

      worker.on('completed', (job) => {
        console.log(`[Worker] Job ${job.id} concluído`)
      })

      worker.on('failed', (job, err) => {
        console.error(`[Worker] Job ${job?.id} falhou: ${err.message}`)
      })

      worker.on('error', (err) => {
        console.error(`[Worker] Erro: ${err.message}`)
      })

      console.log('[Worker] Worker iniciado')
    } catch (error) {
      console.log('[Worker] Erro ao iniciar:', error)
    }
  },

  stop: async () => {
    if (worker) {
      await worker.close()
      console.log('[Worker] Parado')
    }
  },
}

messageWorker.start()
