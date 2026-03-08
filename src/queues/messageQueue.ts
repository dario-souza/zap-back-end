import { Queue, QueueEvents } from 'bullmq';
import { redisConnection } from '../config/redis.ts';

export const messageQueue = new Queue('message-queue', {
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

export const queueEvents = new QueueEvents('message-queue', {
  connection: redisConnection as any,
});

export const sendMessageJob = async (data: {
  messageId: string;
  phone: string;
  content: string;
  scheduledAt?: string;
  userId?: string;
  contactId?: string;
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
