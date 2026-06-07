import { Worker, Job, Queue } from 'bullmq'
import { redisConnection } from '../config/redis.ts'
import { billingRepository } from '../modules/billing/billing.repository.ts'
import { billingService } from '../modules/billing/billing.service.ts'
import { whatsappService } from '../integrations/whatsapp/whatsapp.service.ts'
import { AppError } from '../shared/errors/AppError.ts'

const PIX_RENEWAL_SCHEDULER_ID = 'pix-renewal-daily'
const PIX_RENEWAL_JOB_NAME = 'pix-renewal-check'

const formatDate = (iso: string): string =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso))

let worker: Worker | null = null
let schedulerQueue: Queue | null = null

export const pixRenewalWorker = {
  start: async () => {
    if (worker) return

    // Cria uma Queue própria (mesma conexão Redis) para registrar o scheduler.
    schedulerQueue = new Queue('pix-renewal', { connection: redisConnection as any })

    await schedulerQueue.upsertJobScheduler(
      PIX_RENEWAL_SCHEDULER_ID,
      { pattern: '0 12 * * *' }, // 12:00 UTC = 09:00 SP
      {
        name: PIX_RENEWAL_JOB_NAME,
        data: { source: 'pix-renewal-daily' },
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        },
      },
    )

    worker = new Worker(
      'pix-renewal',
      async (job: Job) => {
        if (job.name !== PIX_RENEWAL_JOB_NAME) return
        await runPixRenewalCheck()
      },
      { connection: redisConnection as any, concurrency: 1 },
    )

    worker.on('failed', (job, err) => {
      console.error(`[PixRenewalWorker] job ${job?.id} falhou:`, err.message)
    })

    console.log('[PixRenewalWorker] iniciado')
  },

  stop: async () => {
    if (worker) {
      await worker.close()
      worker = null
    }
    if (schedulerQueue) {
      await schedulerQueue.close()
      schedulerQueue = null
    }
  },
}

async function runPixRenewalCheck(): Promise<void> {
  console.log('[PixRenewalWorker] verificando assinaturas PIX a expirar...')

  // 1) Expira PIX vencidos
  const expiredCount = await billingService.expireOverduePix()
  if (expiredCount > 0) {
    console.log(`[PixRenewalWorker] ${expiredCount} assinaturas PIX expiradas`)
  }

  // 2) Gera novo PIX para quem está prestes a vencer
  const expiring = await billingRepository.findPixExpiringSoon(3)
  console.log(
    `[PixRenewalWorker] ${expiring.length} assinaturas PIX próximas do vencimento`,
  )

  for (const sub of expiring) {
    try {
      await generateRenewalPix(sub.user_id, sub.plan as 'starter' | 'pro')
    } catch (err) {
      console.error(
        `[PixRenewalWorker] falha ao gerar PIX para ${sub.user_id}:`,
        err,
      )
    }
  }
}

async function generateRenewalPix(
  userId: string,
  plan: 'starter' | 'pro',
): Promise<void> {
  const pix = await billingService.renewPix(userId)
  const periodEnd = new Date()
  periodEnd.setDate(periodEnd.getDate() + 30)

  const sessionStatus = await whatsappService.getSessionStatus(userId)
  if (!sessionStatus.connected) {
    console.warn(
      `[PixRenewalWorker] sessão WAHA não conectada para ${userId} — não enviarei WhatsApp`,
    )
    return
  }

  const sessionName = whatsappService.getSessionName(userId)
  const phone =
    sessionStatus.phone?.replace(/\D/g, '') ||
    sessionStatus.pushName ||
    ''

  if (!phone) {
    console.warn(
      `[PixRenewalWorker] telefone não encontrado para ${userId}`,
    )
    return
  }

  const caption =
    `🔔 *Lembrete de renovação ZapReminder*\n\n` +
    `Seu plano *${plan.toUpperCase()}* vence em breve. ` +
    `Pague o PIX abaixo para renovar até ${formatDate(periodEnd.toISOString())} ` +
    `e manter o acesso ao sistema.\n\n` +
    `Valor: R$ ${plan === 'pro' ? '79,90' : '39,90'}`

  const dataUrl = `data:image/png;base64,${pix.qr_base64}`

  const result = await whatsappService.sendImage(
    sessionName,
    phone,
    dataUrl,
    caption,
  )

  if (!result.success) {
    throw new AppError(
      `Falha ao enviar QR por WhatsApp: ${result.error}`,
      500,
    )
  }

  console.log(
    `[PixRenewalWorker] PIX renewal enviado para ${userId} (wa id: ${result.id})`,
  )
}
