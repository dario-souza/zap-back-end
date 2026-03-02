export type RedisConnection = string | {
  host: string;
  port: number;
  password?: string;
  username?: string;
};

export const getRedisConnection = (): RedisConnection => {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl && redisUrl.startsWith('redis://')) {
    try {
      const url = new URL(redisUrl);
      return {
        host: url.hostname,
        port: parseInt(url.port) || 6379,
        password: url.password || undefined,
        username: url.username || 'default',
      };
    } catch {
      return redisUrl;
    }
  }

  const host = process.env.REDIS_HOST || process.env.REDISHOST;
  const port = process.env.REDIS_PORT || process.env.REDISPORT || '6379';
  const password = process.env.REDIS_PASSWORD || process.env.REDISPASSWORD;
  const user = process.env.REDIS_USER || process.env.REDISUSER || 'default';

  if (!host) {
    throw new Error('ERRO: Nenhuma configuração de Redis encontrada!');
  }

  return {
    host,
    port: parseInt(port),
    password: password || undefined,
    username: user,
  };
};
