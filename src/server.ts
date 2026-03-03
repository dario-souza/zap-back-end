import app from './app.ts'

const PORT = process.env.PORT || 3001

console.log('📝 Iniciando servidor...')
console.log('📝 Redis config:', {
  hasUrl: !!process.env.REDIS_URL,
  hasHost: !!process.env.REDIS_HOST,
  hasSeparate: !!(process.env.REDIS_HOST && process.env.REDIS_PORT),
})

// Iniciar servidor
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`)
  console.log(`📡 Ambiente: ${process.env.NODE_ENV || 'development'}`)
})

process.on('SIGTERM', async () => {
  console.log('🔄 Encerrando servidor...')
  server.close(() => {
    console.log('✅ Servidor encerrado')
    process.exit(0)
  })
})

process.on('SIGINT', async () => {
  console.log('🔄 Encerrando servidor...')
  server.close(() => {
    console.log('✅ Servidor encerrado')
    process.exit(0)
  })
})
