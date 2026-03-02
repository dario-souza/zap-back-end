import { Queue, QueueEvents } from 'bullmq';

const getRedisUrl = () => {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl && redisUrl.startsWith('redis://')) {
    console.log('[Queue] Usando REDIS_URL');
    return redisUrl;
  }

  const host = process.env.REDIS_HOST || process.env.REDISHOST;
  const port = process.env.REDIS_PORT || process.env.REDISPORT || '6379';
  const password = process.env.REDIS_PASSWORD || process.env.REDISPASSWORD;
  const user = process.env.REDIS_USER || process.env.REDISUSER || 'default';

  if (!host) {
    throw new Error('ERRO: Nenhuma configuração de Redis encontrada!');
  }

  return `redis://${user}:${password}@${host}:${port}`;
};

const redisUrl = getRedisUrl();

export const messageQueue = new Queue('message-queue', {
  connection: redisUrl as any,
  defaultJobOptions: {
    removeOnComplete: {
      count: 1000,
    },
    removeOnFail: {
      count: 500,
    },
  },
});

export const queueEvents = new QueueEvents('message-queue', {
  connection: redisUrl as any,
});

export const sendMessageJob = async (data: {
  messageId: string;
  phone: string;
  content: string;
  scheduledAt?: string;
}) => {
  const delay = data.scheduledAt
    ? new Date(data.scheduledAt).getTime() - Date.now()
    : 0;

  return messageQueue.add(
    'send-message',
    data,
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
};

export const sendReminderJob = async (data: {
  messageId: string;
  phone: string;
  content: string;
  reminderDate: string;
}) => {
  const delay = new Date(data.reminderDate).getTime() - Date.now();

  return messageQueue.add(
    'send-reminder',
    data,
    {
      delay: Math.max(0, delay),
      removeOnComplete: true,
      removeOnFail: true,
      attempts: 2,
    }
  );
};

export const scheduleRecurringJob = async (data: {
  messageId: string;
  phone: string;
  content: string;
  cron: string;
}) => {
  return messageQueue.add(
    'send-recurring',
    data,
    {
      repeat: {
        pattern: data.cron,
      },
      removeOnComplete: true,
      removeOnFail: true,
    }
  );
};

export default messageQueue;
