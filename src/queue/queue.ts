import { Queue } from 'bullmq'
import { redisConnection } from '../config/redis.ts'
import type { JobPayload } from './job.types.ts'

const QUEUE_NAME = 'messages'

let queueInstance: Queue | null = null

const getQueue = (): Queue => {
  if (!queueInstance) {
    queueInstance = new Queue(QUEUE_NAME, {
      connection: redisConnection as any,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 500 },
      },
    })
  }
  return queueInstance
}

export const messageQueue = {
  async add(
    jobName: string,
    data: JobPayload,
    options?: { delay?: number; repeat?: { pattern: string } },
  ): Promise<string | undefined> {
    const queue = getQueue()

    console.log(
      `[Queue] Criando job na fila: ${QUEUE_NAME}, userId: ${data.userId}`,
    )

    const job = await queue.add(jobName, data, {
      delay: options?.delay,
      repeat: options?.repeat,
    })

    console.log(`[Queue] Job ID: ${job.id}`)
    return job.id
  },

  async addScheduled(
    data: JobPayload & { scheduledAt: string },
  ): Promise<string | undefined> {
    const delay = new Date(data.scheduledAt).getTime() - Date.now()
    return this.add('send-message', data, { delay: Math.max(0, delay) })
  },

  async addRecurring(
    schedulerId: string,
    data: JobPayload,
    cronPattern: string,
  ): Promise<string | undefined> {
    const queue = getQueue()

    await queue.upsertJobScheduler(
      schedulerId,
      { pattern: cronPattern },
      {
        name: 'send-message',
        data,
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      },
    )

    return schedulerId
  },

  async getJob(jobId: string) {
    const queue = getQueue()
    return queue.getJob(jobId)
  },

  async removeJobScheduler(schedulerId: string): Promise<void> {
    const queue = getQueue()
    await queue.removeJobScheduler(schedulerId)
  },

  async removeRecurring(schedulerId: string): Promise<void> {
    return this.removeJobScheduler(schedulerId)
  },

  async close(): Promise<void> {
    if (queueInstance) {
      await queueInstance.close()
      queueInstance = null
    }
  },
}
