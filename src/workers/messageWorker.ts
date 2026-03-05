import { Worker, Job } from 'bullmq'
import { supabase } from '../config/supabase.ts'
import { wahaService } from '../services/waha.service.ts'
import { redisConnection } from '../config/redis.ts'

let worker: Worker | null = null

const startWorker = async () => {
  try {
    console.log('[Worker] Iniciando worker de mensagens...')

    worker = new Worker(
      'message-queue',
      async (job: Job) => {
        const { messageId, phone, content, userId } = job.data
        console.log(`[Worker] Processando mensagem ${messageId}`)

        try {
          const sent = await wahaService.sendMessage(userId, phone, content)

          if (sent) {
            await supabase
              .from('messages')
              .update({
                status: 'SENT',
                sent_at: new Date().toISOString(),
              })
              .eq('id', messageId)

            console.log(`[Worker] Mensagem ${messageId} enviada com sucesso`)
          }
        } catch (error) {
          console.error(`[Worker] Erro ao enviar mensagem ${messageId}:`, error)
          await supabase
            .from('messages')
            .update({ status: 'FAILED' })
            .eq('id', messageId)
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
