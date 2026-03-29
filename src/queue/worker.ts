import { Worker, Job } from 'bullmq'
import { whatsappService } from '../integrations/whatsapp/whatsapp.service.ts'
import { redisConnection } from '../config/redis.ts'
import { messageRepository } from '../modules/messages/message.repository.ts'
import { contactRepository } from '../modules/contacts/contact.repository.ts'
import { messageLogRepository } from '../modules/messages/message-log.repository.ts'
import { calculateNextSendAt } from '../shared/utils/calcNextRun.ts'
import { AppError } from '../shared/errors/AppError.ts'
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

          if (job.name === 'send-confirmation') {
            return handleConfirmationJob(job)
          }

          return handleMessageJob(job)
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

async function handleConfirmationJob(job: Job<JobPayload>) {
  const {
    confirmationId,
    userId,
    sessionName,
    phone,
    content,
    contactId,
    contactName,
    eventDate,
  } = job.data
  if (!confirmationId) throw new Error('confirmationId ausente no job')

  const humanDelay = getRandomDelay(WHATSAPP_MIN_DELAY, WHATSAPP_MAX_DELAY)
  console.log(
    `[Worker] Delay humano: ${humanDelay}ms para confirmação ${confirmationId}`,
  )
  await sleep(humanDelay)

  let finalContent = content
  if (contactId) {
    const contact = await contactRepository.findById(contactId, userId)
    if (contact) {
      finalContent = replaceVariables(finalContent, contact)
    }
  }

  finalContent = finalContent.replace(
    /\{\{contact_name\}\}/gi,
    contactName || '',
  )
  finalContent = finalContent.replace(/\{\{nome\}\}/gi, contactName || '')
  finalContent = finalContent.replace(
    /\{\{event_date\}\}/gi,
    eventDate
      ? new Intl.DateTimeFormat('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }).format(new Date(eventDate))
      : '',
  )

  console.log(`[Worker] Enviando confirmação para ${phone}`)
  
  const sessionStatus = await whatsappService.getSessionStatus(userId)
  if (!sessionStatus.connected) {
    const { confirmationRepository } = await import('../modules/confirmations/confirmation.repository.ts')
    await confirmationRepository.updateMessageStatus(confirmationId, 'failed')
    throw new AppError(sessionStatus.error || 'WhatsApp não conectado', 503)
  }
  
  const result = await whatsappService.send(sessionName, phone, finalContent)

  if (result.success && result.id) {
    const { confirmationRepository } =
      await import('../modules/confirmations/confirmation.repository.ts')
    await confirmationRepository.updateMessageStatus(
      confirmationId,
      'sent',
      result.id,
    )
    console.log(`[Worker] Confirmação enviada! WAHA ID: ${result.id}`)
    return { success: true, waMessageId: result.id }
  } else {
    const { confirmationRepository } =
      await import('../modules/confirmations/confirmation.repository.ts')
    await confirmationRepository.updateMessageStatus(confirmationId, 'failed')
    throw new AppError(result.error || 'Falha ao enviar confirmação', 500)
  }
}

async function handleMessageJob(job: Job<JobPayload>) {
  const {
    messageId,
    phone,
    content,
    userId,
    sessionName,
    contactId,
    recurrenceCron,
  } = job.data

  const humanDelay = getRandomDelay(WHATSAPP_MIN_DELAY, WHATSAPP_MAX_DELAY)
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
  
  const sessionStatus = await whatsappService.getSessionStatus(userId)
  if (!sessionStatus.connected) {
    if (messageId) {
      await messageRepository.updateStatus(messageId, userId, 'failed')
      await messageLogRepository.create({
        messageId,
        userId,
        event: 'failed',
        metadata: { error: sessionStatus.error || 'WhatsApp não conectado' },
      })
    }
    throw new AppError(sessionStatus.error || 'WhatsApp não conectado', 503)
  }
  
  const result = await whatsappService.send(sessionName, phone, finalContent)

  if (result.success && result.id) {
    if (messageId) {
      const updated = await messageRepository.updateStatus(
        messageId,
        userId,
        'sent',
      )
      if (!updated) {
        console.warn(
          `[Worker] Mensagem ${messageId} não encontrada — pulando update`,
        )
      } else {
        await messageRepository.updateWaMessageId(messageId, userId, result.id)
        await messageLogRepository.create({
          messageId,
          userId,
          event: 'sent',
          wahaMessageId: result.id,
        })

        if (recurrenceCron) {
          const nextSendAt = calculateNextSendAt(recurrenceCron)
          await messageRepository.updateNextSendAt(
            messageId,
            userId,
            nextSendAt.toISOString(),
          )
        }
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
    throw new AppError(result.error || 'Falha ao enviar', 500)
  }
}

messageWorker.start()
