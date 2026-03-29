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
          delay: 1000,
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

    console.log(`[Queue] Criando job na fila: ${QUEUE_NAME}, userId: ${data.userId}`)

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

  async addConfirmation(
    data: JobPayload,
    scheduledAt: string,
  ): Promise<string | undefined> {
    const delay = new Date(scheduledAt).getTime() - Date.now()
    return this.add('send-confirmation', data, { delay: Math.max(0, delay) })
  },

  async addRecurring(
    schedulerId: string,
    data: JobPayload,
    cronPatternUTC: string,
    nextSendAt?: Date,
  ): Promise<string | undefined> {
    const queue = getQueue()
    const now = Date.now()

    console.log(`[Queue] Criando job recorrente: ${schedulerId}, cron (UTC): ${cronPatternUTC}`)

    if (nextSendAt) {
      const nextTime = nextSendAt.getTime()
      const delay = nextTime - now

      console.log(`[Queue] Próximo envio: ${nextSendAt.toISOString()}, delay: ${delay}ms`)

      if (delay > 0) {
        console.log(`[Queue] Criando job único para primeiro envio (não cria scheduler agora)`)
        
        await queue.add('send-message', {
          ...data,
          schedulerId,
          cronPatternUTC,
        }, {
          delay: Math.max(0, delay),
        })
        
        console.log(`[Queue] Job criado com delay ${delay}ms - worker vai criar scheduler após processar`)
        return schedulerId
      }
    }

    const repeatOptions = {
      pattern: cronPatternUTC,
    }

    await queue.upsertJobScheduler(
      schedulerId,
      repeatOptions,
      {
        name: 'send-message',
        data,
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      },
    )
    
    console.log(`[Queue] Job scheduler criado com sucesso!`)
    return schedulerId
  },

  async createScheduler(schedulerId: string, data: JobPayload, cronPatternUTC: string): Promise<void> {
    const queue = getQueue()
    
    console.log(`[Queue] Criando scheduler: ${schedulerId}, cron: ${cronPatternUTC}`)
    
    await queue.upsertJobScheduler(
      schedulerId,
      { pattern: cronPatternUTC },
      {
        name: 'send-message',
        data,
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      },
    )
    
    console.log(`[Queue] Scheduler criado com sucesso!`)
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
