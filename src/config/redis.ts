import { Redis } from 'ioredis'
import { env } from './env.ts'

export type RedisConnectionOptions = {
  host: string
  port: number
  password?: string
  username?: string
  maxRetriesPerRequest: null
}

const getRedisOptions = (): RedisConnectionOptions => {
  if (env.REDIS_URL && env.REDIS_URL.startsWith('redis://')) {
    try {
      const url = new URL(env.REDIS_URL)
      return {
        host: url.hostname,
        port: parseInt(url.port) || 6379,
        password: url.password || undefined,
        username: url.username || 'default',
        maxRetriesPerRequest: null,
      }
    } catch {
      return {
        host: 'localhost',
        port: 6379,
        maxRetriesPerRequest: null,
      }
    }
  }

  const host = env.REDIS_HOST || 'localhost'
  const port = env.REDIS_PORT || 6379
  const password = env.REDIS_PASSWORD

  if (!host) {
    throw new Error('ERRO: Nenhuma configuração de Redis encontrada!')
  }

  return {
    host,
    port,
    password: password || undefined,
    maxRetriesPerRequest: null,
  }
}

export const redisConnection = new Redis(getRedisOptions())

redisConnection.on('connect', () => {
  console.log('✅ Conectado ao Redis')
})

redisConnection.on('error', (err: Error) => {
  console.error('❌ Erro no Redis:', err.message)
})
