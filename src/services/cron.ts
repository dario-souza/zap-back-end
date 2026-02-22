import cron from 'node-cron';
import { prisma } from '../lib/prisma.ts';
import { wahaService } from './waha.ts';
import { MessageStatus, RecurrenceType } from '@prisma/client';

export class CronService {
  private isRunning: boolean = false;
  private task: cron.ScheduledTask | null = null;
  private processingMessages: Set<string> = new Set();

  start() {
    if (this.isRunning) {
      console.log('[Cron] Serviço já está rodando');
      return;
    }

    console.log('[Cron] Iniciando serviço de agendamento...');
    
    this.task = cron.schedule('* * * * *', async () => {
      await this.processScheduledMessages();
    });

    this.isRunning = true;
    console.log('[Cron] Serviço iniciado - verificando a cada minuto');
  }

  stop() {
    if (this.task) {
      this.task.stop();
      this.task = null;
      this.isRunning = false;
      console.log('[Cron] Serviço parado');
    }
  }

  private async processScheduledMessages() {
    try {
      const now = new Date();
      
      // Busca mensagens agendadas que já passaram do horário
      const scheduledMessages = await prisma.message.findMany({
        where: {
          status: MessageStatus.SCHEDULED,
          scheduledAt: {
            lte: now,
          },
        },
        include: {
          contact: true,
          user: true,
        },
      });

      if (scheduledMessages.length === 0) {
        return;
      }

      console.log(`[Cron] Encontradas ${scheduledMessages.length} mensagens para enviar`);

      // Agrupa mensagens por usuário para verificar conexão de cada um
      const messagesByUser = new Map();
      for (const message of scheduledMessages) {
        if (!messagesByUser.has(message.userId)) {
          messagesByUser.set(message.userId, []);
        }
        messagesByUser.get(message.userId).push(message);
      }

      // Processa mensagens de cada usuário
      for (const [userId, messages] of messagesByUser) {
        await this.processUserMessages(userId, messages);
      }
    } catch (error: any) {
      console.error('[Cron] Erro ao processar mensagens agendadas:', error.message);
    }
  }

  private async processUserMessages(userId: string, messages: any[]) {
    const sessionName = wahaService.generateSessionName(userId);
    
    // Verifica se o WhatsApp do usuário está conectado
    const isConnected = await wahaService.checkConnection(sessionName);
    if (!isConnected) {
      console.log(`[Cron] WhatsApp do usuário ${userId} não conectado, pulando ${messages.length} mensagens`);
      return;
    }

    for (const message of messages) {
      if (this.processingMessages.has(message.id)) {
        console.log(`[Cron] Mensagem ${message.id} já está sendo processada, pulando...`);
        continue;
      }
      
      this.processingMessages.add(message.id);
      
      try {
        console.log(`[Cron] Enviando mensagem ${message.id} para ${message.contact.phone} (Usuário: ${userId})`);
        
        let sentMessage;
        try {
          sentMessage = await wahaService.sendTextMessage(
            sessionName,
            message.contact.phone,
            message.content
          );
          console.log(`[Cron] Resposta WAHA:`, JSON.stringify(sentMessage));
        } catch (sendError: any) {
          console.error(`[Cron] Erro no sendTextMessage:`, sendError.message);
          throw sendError;
        }

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

          // Lógica de recorrência mensal
          if (message.recurrenceType === RecurrenceType.MONTHLY) {
            console.log(`[Cron] Mensagem ${message.id} é recorrente mensal, criando clone...`);
            
            // Calcular próxima data (mesmo dia do próximo mês)
            const scheduledDate = new Date(message.scheduledAt);
            const nextMonth = new Date(scheduledDate);
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            
            // Criar clone para o próximo mês
            await prisma.message.create({
              data: {
                content: message.content,
                type: message.type,
                status: MessageStatus.SCHEDULED,
                scheduledAt: nextMonth,
                userId: message.userId,
                contactId: message.contactId,
                contactIds: message.contactIds || [message.contactId],
                recurrenceType: RecurrenceType.MONTHLY,
                originalMessageId: message.originalMessageId || message.id,
                isRecurringClone: true,
              },
            });
            console.log(`[Cron] Clone criado para ${nextMonth.toISOString()}`);
          } else {
            // Se não é recorrente, deletar após envio (conforme solicitado)
            console.log(`[Cron] Mensagem ${message.id} não é recorrente, deletando após envio...`);
            await prisma.message.delete({
              where: { id: message.id },
            });
            console.log(`[Cron] Mensagem ${message.id} deletada`);
          }
        } catch (dbError: any) {
          console.error(`[Cron] Erro ao atualizar banco para mensagem ${message.id}:`, dbError.message);
          throw dbError;
        }

        console.log(`[Cron] Mensagem ${message.id} enviada com sucesso (ID: ${sentMessage.id})`);
      } catch (error: any) {
        console.error(`[Cron] Erro ao enviar mensagem ${message.id}:`, error.message);
        
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
          }
        } catch (dbError: any) {
          console.error(`[Cron] Erro ao marcar mensagem como FAILED:`, dbError.message);
        }
      } finally {
        this.processingMessages.delete(message.id);
      }
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      nextRun: this.task ? 'A cada minuto' : 'Parado',
    };
  }
}

export const cronService = new CronService();
