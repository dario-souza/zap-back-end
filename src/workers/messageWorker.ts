import { Worker, Job } from 'bullmq';
import { supabase } from '../config/supabase.ts';
import { wahaService } from '../services/waha.service.ts';
import { redisConnection } from '../config/redis.ts';

const WHATSAPP_MIN_DELAY = 2000;
const WHATSAPP_MAX_DELAY = 5000;
const WORKER_CONCURRENCY = 1;

interface SendMessageJobData {
  messageId?: string;
  phone: string;
  content: string;
  userId: string;
  contactId?: string;
  scheduledAt?: string;
}

interface SendReminderJobData {
  messageId: string;
  phone: string;
  content: string;
  reminderDate: string;
  userId: string;
}

interface ScheduleRecurringJobData {
  messageId: string;
  phone: string;
  content: string;
  cron: string;
  userId: string;
}

type AnyJobData = SendMessageJobData | SendReminderJobData | ScheduleRecurringJobData;

const replaceVariables = (content: string, contact: { name?: string; phone?: string } | null): string => {
  if (!contact) return content;
  
  let result = content;
  result = result.replace(/\{\{nome\}\}/gi, contact.name || '');
  result = result.replace(/\{\{name\}\}/gi, contact.name || '');
  result = result.replace(/\{\{phone\}\}/gi, contact.phone || '');
  result = result.replace(/\{\{telefone\}\}/gi, contact.phone || '');
  
  return result;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getRandomDelay = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

let worker: Worker | null = null;

const startWorker = async () => {
  try {
    console.log('[Worker] Iniciando worker...');
    console.log(`[Worker] Delay: ${WHATSAPP_MIN_DELAY}-${WHATSAPP_MAX_DELAY}ms`);
    console.log(`[Worker] Concorrência: ${WORKER_CONCURRENCY}`);
    console.log(`[Worker] Fila: whatsapp-messages`);

    worker = new Worker<AnyJobData>(
      'whatsapp-messages',
      async (job: Job<AnyJobData>) => {
        console.log(`[Worker] Job ${job.id} - Tipo: ${job.name}`);

        if (job.name === 'send-message') {
          const data = job.data as SendMessageJobData;
          const { messageId, phone, content, userId, contactId, scheduledAt } = data;

          const humanDelay = getRandomDelay(WHATSAPP_MIN_DELAY, WHATSAPP_MAX_DELAY);
          console.log(`[Worker] Delay humano: ${humanDelay}ms para user ${userId.substring(0, 8)}`);
          await sleep(humanDelay);

          let finalContent = content;

          if (contactId) {
            const { data: contact } = await supabase
              .from('contacts')
              .select('name, phone')
              .eq('id', contactId)
              .single();
            
            if (contact) {
              finalContent = replaceVariables(content, contact);
            }
          }

          console.log(`[Worker] Enviando para ${phone}`);
          const result = await wahaService.sendMessage(userId, phone, finalContent);

          if (result.success && result.messageId) {
            if (messageId) {
              await supabase
                .from('messages')
                .update({
                  status: 'SENT',
                  sent_at: new Date().toISOString(),
                  wa_message_id: result.messageId,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', messageId)
                .eq('user_id', userId);
            }
            console.log(`[Worker] Sucesso! WAHA ID: ${result.messageId}`);
            return { success: true, waMessageId: result.messageId };
          } else {
            console.error(`[Worker] Falha: ${result.error}`);
            if (messageId) {
              await supabase
                .from('messages')
                .update({ status: 'FAILED', updated_at: new Date().toISOString() })
                .eq('id', messageId)
                .eq('user_id', userId);
            }
            throw new Error(result.error || 'Falha ao enviar');
          }
        }

        if (job.name === 'send-reminder') {
          const data = job.data as SendReminderJobData;
          const { messageId, phone, content, userId } = data;

          await sleep(getRandomDelay(WHATSAPP_MIN_DELAY, WHATSAPP_MAX_DELAY));
          const result = await wahaService.sendMessage(userId, phone, content);

          if (!result.success) {
            throw new Error(result.error || 'Falha ao enviar lembrete');
          }
          return { success: true };
        }

        if (job.name === 'send-recurring') {
          const data = job.data as ScheduleRecurringJobData;
          const { messageId, phone, content, userId } = data;

          const result = await wahaService.sendMessage(userId, phone, content);

          if (!result.success) {
            throw new Error(result.error || 'Falha ao enviar recorrente');
          }
          
          // Atualiza o status da mensagem recorrente para indicar que foi enviada
          // Mas mantém a recorrência ativa para próximos envios
          await supabase
            .from('messages')
            .update({
              status: 'SENT',
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', messageId)
            .eq('user_id', userId);
            
          return { success: true };
        }

        return { success: false, error: 'Job type unknown' };
      },
      {
        connection: redisConnection as any,
        concurrency: WORKER_CONCURRENCY,
      }
    );

    worker.on('completed', (job) => {
      console.log(`[Worker] Job ${job.id} concluído`);
    });

    worker.on('failed', (job, err) => {
      console.error(`[Worker] Job ${job?.id} falhou: ${err.message}`);
    });

    worker.on('error', (err) => {
      console.error(`[Worker] Erro: ${err.message}`);
    });

    console.log('[Worker] Worker iniciado');
  } catch (error) {
    console.log('[Worker] Erro ao iniciar:', error);
  }
};

startWorker();

export const stopWorker = async () => {
  if (worker) {
    await worker.close();
    console.log('[Worker] Parado');
  }
};

export default worker;