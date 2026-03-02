import { Worker, Job } from 'bullmq'
import IORedis from 'ioredis'
import { supabase } from '../lib/supabase.js'
import { wahaService } from '../services/waha.service.js'

let worker: Worker | null = null

// const getConnection = () => {
//   const redisUrl = process.env.REDIS_URL;

//   if (redisUrl) {
//     console.log('[Worker] Usando REDIS_URL');
//     return new IORedis(redisUrl, {
//       maxRetriesPerRequest: null,
//       enableOfflineQueue: false,
//       lazyConnect: true,
//     });
//   } else {
//     const host = process.env.REDIS_HOST || process.env.REDISHOST;
//     const port = parseInt(process.env.REDIS_PORT || process.env.REDISPORT || '6379');
//     const password = process.env.REDIS_PASSWORD || process.env.REDISPASSWORD;
//     const user = process.env.REDIS_USER || process.env.REDISUSER || 'default';

//     console.log('[Worker] Usando variáveis separadas - Host:', host);

//     return new IORedis({
//       host,
//       port,
//       username: user,
//       password,
//       maxRetriesPerRequest: null,
//       enableOfflineQueue: false,
//       lazyConnect: true,
//     });
//   }
// };

const getConnection = () => {
  // 1. Tenta a URL completa primeiro
  const redisUrl = process.env.REDIS_URL

  if (redisUrl && redisUrl.startsWith('redis://')) {
    console.log('[Worker] Conectando via REDIS_URL')
    return new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
    })
  }

  // 2. Fallback para variáveis separadas
  const host = process.env.REDIS_HOST || process.env.REDISHOST
  const port = parseInt(
    process.env.REDIS_PORT || process.env.REDISPORT || '6379',
  )
  const password = process.env.REDIS_PASSWORD || process.env.REDISPASSWORD

  // LOG DE DEBUG (Importante para ver no Railway)
  console.log(
    `[Worker] Tentando conexão manual -> Host: ${host}, Port: ${port}, Password: ${password ? 'definida' : 'vazia'}`,
  )

  if (!host) {
    throw new Error(
      'ERRO: Nenhuma configuração de Redis encontrada (HOST está vazio)!',
    )
  }

  return new IORedis({
    host,
    port,
    password,
    username: process.env.REDIS_USER || 'default',
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
  })
}
const startWorker = async () => {
  try {
    const conn = getConnection()

    await conn.connect()

    worker = new Worker(
      'message-queue',
      async (job: Job) => {
        const { messageId, phone, content } = job.data
        console.log(`[Worker] Processando mensagem ${messageId}`)

        try {
          const sent = await wahaService.sendMessage(phone, content)

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
        connection: conn,
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

// Iniciar worker em background (não bloquear servidor)
setTimeout(() => {
  startWorker()
}, 1000)

export const stopWorker = async () => {
  if (worker) {
    await worker.close()
    console.log('[Worker] Worker de mensagens parado')
  }
}

export default worker
