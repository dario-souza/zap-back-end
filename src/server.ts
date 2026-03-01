import app from './app.ts';
import { stopWorker } from './workers/messageWorker.js';

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📡 Ambiente: ${process.env.NODE_ENV || 'development'}`);
});

process.on('SIGTERM', async () => {
  console.log('🔄 Encerrando servidor...');
  await stopWorker();
  server.close(() => {
    console.log('✅ Servidor encerrado');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('🔄 Encerrando servidor...');
  await stopWorker();
  server.close(() => {
    console.log('✅ Servidor encerrado');
    process.exit(0);
  });
});
