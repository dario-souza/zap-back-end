import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.ts';
import { MessageStatus } from '@prisma/client';

// Tipos de eventos da WAHA
interface WAHAWebhookEvent {
  event: string;
  session: string;
  payload: any;
  timestamp?: number;
}

// Armazenamento em memória dos eventos recentes (para debugging)
const recentEvents: WAHAWebhookEvent[] = [];
const MAX_EVENTS = 100;

// Callbacks registrados para eventos
const eventCallbacks: Map<string, ((event: WAHAWebhookEvent) => void)[]> = new Map();

export class WebhookController {
  // Receber webhook da WAHA - usando arrow function para manter o contexto do this
  handleWAHAWebhook = async (req: Request, res: Response) => {
    try {
      console.log('[WAHA Webhook] ====================================');
      console.log('[WAHA Webhook] RAW BODY recebido:', JSON.stringify(req.body, null, 2));
      console.log('[WAHA Webhook] ====================================');
      
      const event: WAHAWebhookEvent = {
        event: req.body.event,
        session: req.body.session,
        payload: req.body.payload,
        timestamp: Date.now(),
      };

      // Armazena evento para debugging
      recentEvents.unshift(event);
      if (recentEvents.length > MAX_EVENTS) {
        recentEvents.pop();
      }

      console.log(`[WAHA Webhook] Evento recebido: ${event.event}`, {
        session: event.session,
        timestamp: new Date().toISOString(),
      });

      // Processa evento específico
      await this.processEvent(event);

      // Notifica callbacks registrados
      this.notifyCallbacks(event);

      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('[WAHA Webhook] Erro ao processar:', error);
      res.status(500).json({ error: error.message });
    }
  };

  // Processar evento baseado no tipo
  private async processEvent(event: WAHAWebhookEvent) {
    switch (event.event) {
      case 'session.status':
        await this.handleSessionStatus(event);
        break;
      case 'message':
        await this.handleMessage(event);
        break;
      case 'message.ack':
        await this.handleMessageAck(event);
        break;
      case 'message.any':
        await this.handleMessageAny(event);
        break;
      case 'engine.event':
        // Eventos de engine (logs internos)
        console.log('[WAHA Engine]', event.payload);
        break;
      default:
        console.log(`[WAHA Webhook] Evento não tratado: ${event.event}`, event.payload);
    }
  }

  // Handler para mudanças de status da sessão
  private async handleSessionStatus(event: WAHAWebhookEvent) {
    const { status } = event.payload;
    console.log(`[WAHA Session] Status alterado: ${status}`, {
      session: event.session,
    });

    // Aqui você pode implementar lógica adicional
    // Por exemplo: notificar usuário, atualizar banco de dados, etc.
    
    switch (status) {
      case 'WORKING':
        console.log('[WAHA Session] WhatsApp conectado com sucesso!');
        break;
      case 'SCAN_QR_CODE':
        console.log('[WAHA Session] Aguardando scan do QR Code');
        break;
      case 'FAILED':
        console.log('[WAHA Session] Falha na conexão');
        break;
      case 'STOPPED':
        console.log('[WAHA Session] Sessão parada');
        break;
    }
  }

  // Handler para mensagens recebidas
  private async handleMessage(event: WAHAWebhookEvent) {
    const message = event.payload;
    console.log('[WAHA Message] Mensagem recebida:', {
      from: message.from,
      type: message.type,
      timestamp: message.timestamp,
    });

    // Aqui você pode implementar:
    // - Respostas automáticas
    // - Logging de mensagens recebidas
    // - Integrações com outros sistemas
  }

  // Handler para confirmação de entrega (ack)
  private async handleMessageAck(event: WAHAWebhookEvent) {
    const { messageId: rawMessageId, ack } = event.payload;
    
    // Extrai o ID real da mensagem
    const messageId = rawMessageId.includes('_') 
      ? rawMessageId.split('_').pop() 
      : rawMessageId;
    
    console.log('[WAHA Message ACK] ====================================');
    console.log('[WAHA Message ACK] Payload completo:', JSON.stringify(event.payload, null, 2));
    console.log('[WAHA Message ACK] messageId original:', rawMessageId);
    console.log('[WAHA Message ACK] messageId extraído:', messageId);
    console.log('[WAHA Message ACK] ack recebido:', ack, '| tipo:', typeof ack);
    console.log('[WAHA Message ACK] ====================================');

    // ack: 1 = sent, 2 = delivered, 3 = read
    try {
      // Mapeia o ack para o status correspondente
      let newStatus: MessageStatus | null = null;
      let updateData: any = {};

      // Converte ack para número (pode vir como string)
      const ackNum = parseInt(ack);
      
      switch (ackNum) {
        case 1:
          newStatus = MessageStatus.SENT;
          updateData = { status: newStatus, sentAt: new Date() };
          break;
        case 2:
          newStatus = MessageStatus.DELIVERED;
          updateData = { status: newStatus, deliveredAt: new Date() };
          break;
        case 3:
          newStatus = MessageStatus.READ;
          updateData = { status: newStatus, readAt: new Date() };
          break;
        default:
          console.log(`[WAHA Message ACK] Ack desconhecido: ${ack} (convertido: ${ackNum})`);
          return;
      }

      console.log(`[WAHA Message ACK] Buscando mensagem com externalId: "${messageId}"`);
      
      // Busca e atualiza a mensagem pelo externalId (ID do WhatsApp)
      const message = await prisma.message.findFirst({
        where: { externalId: messageId }
      });

      if (message) {
        console.log(`[WAHA Message ACK] Mensagem encontrada:`, {
          id: message.id,
          externalId: message.externalId,
          statusAtual: message.status
        });
        
        await prisma.message.update({
          where: { id: message.id },
          data: updateData
        });
        
        console.log(`[WAHA Message ACK] ✅ Mensagem ${messageId} atualizada para ${newStatus}`);
      } else {
        console.log(`[WAHA Message ACK] ❌ Mensagem ${messageId} NÃO encontrada pelo externalId`);
        
        // Mostra últimas 5 mensagens com externalId no banco para debug
        const recentMessages = await prisma.message.findMany({
          where: { externalId: { not: null } },
          orderBy: { sentAt: 'desc' },
          take: 5,
          select: { id: true, externalId: true, status: true }
        });
        
        console.log(`[WAHA Message ACK] Últimas mensagens no banco:`, recentMessages);
      }
    } catch (error) {
      console.error('[WAHA Message ACK] ❌ Erro ao atualizar status:', error);
    }
  }

  // Handler para message.any (NOWEB usa isso em vez de message.ack)
  private async handleMessageAny(event: WAHAWebhookEvent) {
    const payload = event.payload;
    
    // Só processa mensagens enviadas por nós (fromMe = true)
    if (!payload.fromMe) {
      return;
    }

    console.log('[WAHA Message ANY] ====================================');
    console.log('[WAHA Message ANY] Payload:', JSON.stringify(payload, null, 2));
    console.log('[WAHA Message ANY] ID:', payload.id);
    console.log('[WAHA Message ANY] ACK:', payload.ack, '| ACK Name:', payload.ackName);
    console.log('[WAHA Message ANY] ====================================');

    // Processa o campo ack se existir
    if (payload.ack !== undefined) {
      // Extrai o ID real da mensagem - pode vir como "true_5511...@c.us_3EB0..." ou direto "3EB0..."
      const rawMessageId = payload.id;
      const messageId = rawMessageId.includes('_') 
        ? rawMessageId.split('_').pop()  // Pega a última parte após os underscores
        : rawMessageId;
      
      const ack = payload.ack;
      
      try {
        let newStatus: MessageStatus | null = null;
        let updateData: any = {};

        // Converte ack para número
        const ackNum = parseInt(ack);
        
        switch (ackNum) {
          case 1:
            newStatus = MessageStatus.SENT;
            updateData = { status: newStatus, sentAt: new Date() };
            break;
          case 2:
            newStatus = MessageStatus.DELIVERED;
            updateData = { status: newStatus, deliveredAt: new Date() };
            break;
          case 3:
            newStatus = MessageStatus.READ;
            updateData = { status: newStatus, readAt: new Date() };
            break;
          default:
            console.log(`[WAHA Message ANY] Ack não mapeado: ${ack}`);
            return;
        }

        console.log(`[WAHA Message ANY] Buscando mensagem com externalId: "${messageId}"`);
        
        const message = await prisma.message.findFirst({
          where: { externalId: messageId }
        });

        if (message) {
          await prisma.message.update({
            where: { id: message.id },
            data: updateData
          });
          console.log(`[WAHA Message ANY] ✅ Mensagem ${messageId} atualizada para ${newStatus}`);
        } else {
          console.log(`[WAHA Message ANY] ❌ Mensagem ${messageId} não encontrada`);
        }
      } catch (error) {
        console.error('[WAHA Message ANY] ❌ Erro:', error);
      }
    }
  }

  // Notificar callbacks registrados
  private notifyCallbacks(event: WAHAWebhookEvent) {
    const callbacks = eventCallbacks.get(event.event) || [];
    callbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('[WAHA Webhook] Erro no callback:', error);
      }
    });
  }

  // Registrar callback para um tipo de evento
  static on(event: string, callback: (event: WAHAWebhookEvent) => void) {
    if (!eventCallbacks.has(event)) {
      eventCallbacks.set(event, []);
    }
    eventCallbacks.get(event)!.push(callback);
  }

  // Remover callback
  static off(event: string, callback: (event: WAHAWebhookEvent) => void) {
    const callbacks = eventCallbacks.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  // Obter eventos recentes (para debugging)
  getRecentEvents = (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    res.json({
      events: recentEvents.slice(0, limit),
      total: recentEvents.length,
    });
  };

  // Health check do webhook
  healthCheck = (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      recentEvents: recentEvents.length,
      registeredCallbacks: Array.from(eventCallbacks.keys()).map(event => ({
        event,
        count: eventCallbacks.get(event)?.length || 0,
      })),
    });
  };
}

export const webhookController = new WebhookController();
