import cron from 'node-cron';
import { prisma } from '../lib/prisma.ts';
import { wahaService } from './waha.ts';
import { MessageStatus } from '@prisma/client';

export class CronService {
  private isRunning: boolean = false;
  private task: cron.ScheduledTask | null = null;

  // Iniciar o cron job
  start() {
    if (this.isRunning) {
      console.log('[Cron] Serviço já está rodando');
      return;
    }

    console.log('[Cron] Iniciando serviço de agendamento...');
    
    // Executa a cada minuto
    this.task = cron.schedule('* * * * *', async () => {
      await this.processScheduledMessages();
    });

    this.isRunning = true;
    console.log('[Cron] Serviço iniciado - verificando a cada minuto');
  }

  // Parar o cron job
  stop() {
    if (this.task) {
      this.task.stop();
      this.task = null;
      this.isRunning = false;
      console.log('[Cron] Serviço parado');
    }
  }

  // Processar mensagens agendadas
  private async processScheduledMessages() {
    try {
      const now = new Date();
      
      // Busca mensagens agendadas que já passaram do horário
      const scheduledMessages = await prisma.message.findMany({
        where: {
          status: MessageStatus.SCHEDULED,
          scheduledAt: {
            lte: now, // Menor ou igual a data/hora atual
          },
        },
        include: {
          contact: true,
        },
      });

      if (scheduledMessages.length === 0) {
        return;
      }

      console.log(`[Cron] Encontradas ${scheduledMessages.length} mensagens para enviar`);

      // Verifica se WhatsApp está conectado
      const isConnected = await wahaService.checkConnection();
      if (!isConnected) {
        console.log('[Cron] WhatsApp não conectado, não é possível enviar mensagens');
        return;
      }

      // Envia cada mensagem
      for (const message of scheduledMessages) {
        try {
          console.log(`[Cron] Enviando mensagem ${message.id} para ${message.contact.phone}`);
          
          await wahaService.sendTextMessage(
            message.contact.phone,
            message.content
          );

          // Atualiza status para SENT
          await prisma.message.update({
            where: { id: message.id },
            data: {
              status: MessageStatus.SENT,
              sentAt: new Date(),
            },
          });

          console.log(`[Cron] Mensagem ${message.id} enviada com sucesso`);
        } catch (error: any) {
          console.error(`[Cron] Erro ao enviar mensagem ${message.id}:`, error.message);
          
          // Marca como falha
          await prisma.message.update({
            where: { id: message.id },
            data: {
              status: MessageStatus.FAILED,
            },
          });
        }
      }
    } catch (error: any) {
      console.error('[Cron] Erro ao processar mensagens agendadas:', error.message);
    }
  }

  // Status do serviço
  getStatus() {
    return {
      isRunning: this.isRunning,
      nextRun: this.task ? 'A cada minuto' : 'Parado',
    };
  }
}

// Instância singleton
export const cronService = new CronService();
