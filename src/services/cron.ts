import cron from 'node-cron';
import { prisma } from '../lib/prisma.ts';
import { wahaService } from './waha.ts';
import { MessageStatus } from '@prisma/client';

export class CronService {
  private isRunning: boolean = false;
  private task: cron.ScheduledTask | null = null;
  private processingMessages: Set<string> = new Set(); // Evita processar a mesma mensagem 2x

  // Iniciar o cron job
  start() {
    if (this.isRunning) {
      console.log('[Cron] Serviço já está rodando');
      return;
    }

    console.log('[Cron] Iniciando serviço de agendamento...');
    
    // Executa a cada minuto - processa mensagens agendadas
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
        // Evita processar a mesma mensagem 2x simultaneamente
        if (this.processingMessages.has(message.id)) {
          console.log(`[Cron] Mensagem ${message.id} já está sendo processada, pulando...`);
          continue;
        }
        
        this.processingMessages.add(message.id);
        
        try {
          console.log(`[Cron] Enviando mensagem ${message.id} para ${message.contact.phone}`);
          
          let sentMessage;
          try {
            sentMessage = await wahaService.sendTextMessage(
              message.contact.phone,
              message.content
            );
            console.log(`[Cron] Resposta WAHA:`, JSON.stringify(sentMessage));
          } catch (sendError: any) {
            console.error(`[Cron] Erro no sendTextMessage:`, sendError.message);
            console.error(`[Cron] Stack:`, sendError.stack);
            throw sendError;
          }

          // Atualiza status para SENT e salva o externalId
          try {
            await prisma.message.update({
              where: { id: message.id },
              data: {
                status: MessageStatus.SENT,
                sentAt: new Date(),
                externalId: sentMessage.id || null,
              },
            });
            console.log(`[Cron] Mensagem ${message.id} atualizada no banco com sucesso`);
          } catch (dbError: any) {
            console.error(`[Cron] Erro ao atualizar banco para mensagem ${message.id}:`, dbError.message);
            throw dbError;
          }

          console.log(`[Cron] Mensagem ${message.id} enviada com sucesso (ID: ${sentMessage.id})`);
        } catch (error: any) {
          console.error(`[Cron] Erro ao enviar mensagem ${message.id}:`, error.message);
          console.error(`[Cron] Stack completo:`, error.stack);
          
          // Marca como falha (somente se ainda estiver como SCHEDULED)
          try {
            const currentMessage = await prisma.message.findUnique({
              where: { id: message.id },
              select: { status: true }
            });
            
            if (currentMessage?.status === MessageStatus.SCHEDULED) {
              await prisma.message.update({
                where: { id: message.id },
                data: {
                  status: MessageStatus.FAILED,
                },
              });
              console.log(`[Cron] Mensagem ${message.id} marcada como FAILED`);
            } else {
              console.log(`[Cron] Mensagem ${message.id} já não está mais como SCHEDULED (status atual: ${currentMessage?.status}), ignorando`);
            }
          } catch (dbError: any) {
            console.error(`[Cron] Erro ao marcar mensagem como FAILED:`, dbError.message);
          }
        } finally {
          // Remove do Set de processamento
          this.processingMessages.delete(message.id);
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
