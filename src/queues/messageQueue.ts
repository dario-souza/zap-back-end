import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

let connection: IORedis | null = null;

const getConnection = () => {
  if (!connection) {
    const redisUrl = process.env.REDIS_URL;
    console.log('[Queue] REDIS_URL:', redisUrl || 'não definida, usando fallback');
    
    connection = new IORedis(redisUrl || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 100, 3000);
      },
    });
    
    connection.on('error', (err) => {
      console.error('[Queue] Erro na conexão Redis:', err.message);
    });
    
    connection.on('connect', () => {
      console.log('[Queue] Conectado ao Redis');
    });
  }
  return connection;
};

export const messageQueue = new Queue('message-queue', {
  connection: getConnection(),
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
  connection: getConnection(),
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
