function required(key: string): string {
  const value = process.env[key]
  if (!value)
    throw new Error(`Variável de ambiente obrigatória ausente: ${key}`)
  return value
}

export const env = {
  PORT: Number(process.env.PORT ?? 3001),
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  SUPABASE_URL: required('SUPABASE_URL'),
  SUPABASE_ANON_KEY: required('SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: required('SUPABASE_SERVICE_ROLE_KEY'),
  REDIS_URL: process.env.REDIS_URL,
  REDIS_HOST: process.env.REDIS_HOST,
  REDIS_PORT: Number(process.env.REDIS_PORT ?? 6379),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  WAHA_API_URL: required('WAHA_API_URL'),
  WAHA_API_KEY: required('WAHA_API_KEY'),
  WAHA_URL: required('WAHA_API_URL'),
  // WAHA_WS_URL: required('WAHA_WS_URL'),
  WAHA_SESSION_NAME: process.env.WAHA_SESSION_NAME ?? 'default',
  WAHA_WEBHOOK_URL: required('WAHA_WEBHOOK_URL'),
  JWT_SECRET: required('JWT_SECRET'),
}
