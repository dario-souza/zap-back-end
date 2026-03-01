import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { supabase } from '../lib/supabase.js';
import { wahaService } from '../services/waha.service.js';

let worker: Worker | null = null;
let connection: IORedis | null = null;

const getConnection = () => {
  if (!connection) {
    const redisUrl = process.env.REDIS_URL;
    console.log('[Worker] REDIS_URL:', redisUrl || 'não definida');
    
    connection = new IORedis(redisUrl || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 100, 3000);
      },
    });
    
    connection.on('error', (err) => {
      console.error('[Worker] Erro Redis:', err.message);
    });
    
    connection.on('connect', () => {
      console.log('[Worker] Conectado ao Redis');
    });
  }
  return connection;
};

const initializeWorker = async () => {
  try {
    const conn = getConnection();
    
    await new Promise<void>((resolve, reject) => {
      conn.on('connect', () => resolve());
      conn.on('error', (err) => {
        console.log('[Worker] Redis não disponível:', err.message);
        reject(err);
      });
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });

    worker = new Worker(
      'message-queue',
      async (job: Job) => {
        const { messageId, phone, content } = job.data;
        console.log(`[Worker] Processando mensagem ${messageId}`);

        try {
          const sent = await wahaService.sendMessage(phone, content);

          if (sent) {
            await supabase
              .from('messages')
              .update({
                status: 'SENT',
                sent_at: new Date().toISOString(),
              })
              .eq('id', messageId);

            console.log(`[Worker] Mensagem ${messageId} enviada com sucesso`);
          }
        } catch (error) {
          console.error(`[Worker] Erro ao enviar mensagem ${messageId}:`, error);
          await supabase
            .from('messages')
            .update({ status: 'FAILED' })
            .eq('id', messageId);
          throw error;
        }
      },
      {
        connection: conn,
        concurrency: 5,
      }
    );

    worker.on('completed', (job) => {
      console.log(`[Worker] Job ${job.id} concluído`);
    });

    worker.on('failed', (job, err) => {
      console.error(`[Worker] Job ${job?.id} falhou:`, err.message);
    });

    worker.on('error', (err) => {
      console.error('[Worker] Erro no worker:', err.message);
    });

    console.log('[Worker] Worker de mensagens iniciado');
  } catch (error) {
    console.log('[Worker] Redis não disponível, worker não iniciado');
  }
};

initializeWorker();

export const stopWorker = async () => {
  if (worker) {
    await worker.close();
    console.log('[Worker] Worker de mensagens parado');
  }
};

export default worker;
