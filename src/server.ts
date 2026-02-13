import app from './app.ts';
import { cronService } from './services/cron.ts';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📡 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  
  // Inicia o serviço de cron job para mensagens agendadas
  cronService.start();
  console.log('⏰ Serviço de agendamento iniciado');
});
