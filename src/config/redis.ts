import IORedis from 'ioredis';
import { env } from './env.js';

const getRedisOptions = () => {
  if (env.REDIS_URL && env.REDIS_URL.startsWith('redis://')) {
    const url = new URL(env.REDIS_URL);
    return {
      host: url.hostname,
      port: parseInt(url.port) || 6379,
      password: url.password || undefined,
      username: url.username || 'default',
      maxRetriesPerRequest: null,
    };
  }

  return {
    host: env.REDIS_HOST || 'localhost',
    port: env.REDIS_PORT || 6379,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  };
};

export const redisConnection = new IORedis(getRedisOptions());

redisConnection.on('connect', () => {
  console.log('✅ Conectado ao Redis');
});

redisConnection.on('error', (err) => {
  console.error('❌ Erro no Redis:', err.message);
});
