import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis.ts';

const QUEUE_NAME = 'whatsapp-messages';

export interface SendMessageJobData {
  messageId?: string;
  phone: string;
  content: string;
  userId: string;
  contactId?: string;
  scheduledAt?: string;
}

export interface SendReminderJobData {
  messageId: string;
  phone: string;
  content: string;
  reminderDate: string;
  userId: string;
}

export interface ScheduleRecurringJobData {
  messageId: string;
  phone: string;
  content: string;
  cron: string;
  userId: string;
}

let messageQueue: Queue | null = null;

const getQueue = (): Queue => {
  if (!messageQueue) {
    messageQueue = new Queue(QUEUE_NAME, {
      connection: redisConnection as any,
      defaultJobOptions: {
        removeOnComplete: {
          count: 1000,
        },
        removeOnFail: {
          count: 500,
        },
      },
    });
  }
  return messageQueue;
};

export const sendMessageJob = async (userId: string, data: SendMessageJobData): Promise<string | undefined> => {
  const queue = getQueue();
  
  const jobData = { ...data, userId };
  
  console.log(`[Queue] Criando job na fila: ${QUEUE_NAME}, userId: ${userId}`);
  
  const delay = data.scheduledAt
    ? new Date(data.scheduledAt).getTime() - Date.now()
    : 0;

  const job = await queue.add(
    'send-message',
    jobData,
    {
      delay: Math.max(0, delay),
      removeOnComplete: true,
      removeOnFail: true,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    }
  );

  console.log(`[Queue] Job ID: ${job.id}`);
  return job.id;
};

export const sendReminderJob = async (userId: string, data: SendReminderJobData): Promise<string | undefined> => {
  const queue = getQueue();
  const delay = new Date(data.reminderDate).getTime() - Date.now();

  const job = await queue.add(
    'send-reminder',
    { ...data, userId },
    {
      delay: Math.max(0, delay),
      removeOnComplete: true,
      removeOnFail: true,
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    }
  );

  return job.id;
};

export const scheduleRecurringJob = async (userId: string, data: ScheduleRecurringJobData): Promise<string | undefined> => {
  const queue = getQueue();

  const job = await queue.add(
    'send-recurring',
    { ...data, userId },
    {
      repeat: {
        pattern: data.cron,
      },
      removeOnComplete: true,
      removeOnFail: true,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    }
  );

  return job.id;
};

export const closeQueue = async (): Promise<void> => {
  if (messageQueue) {
    await messageQueue.close();
    messageQueue = null;
  }
};

export default {
  sendMessageJob,
  sendReminderJob,
  scheduleRecurringJob,
  closeQueue,
};
