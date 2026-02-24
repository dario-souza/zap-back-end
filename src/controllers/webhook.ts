import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.ts';
import { MessageStatus, ConfirmationStatus } from '@prisma/client';

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

  // Extrai userId do nome da sessão (ex: "user_abc123" -> "abc123")
  private extractUserIdFromSession(sessionName: string): string | null {
    if (sessionName.startsWith('user_')) {
      return sessionName.replace('user_', '');
    }
    return null;
  }

  // Handler para mudanças de status da sessão
  private async handleSessionStatus(event: WAHAWebhookEvent) {
    const { status } = event.payload;
    const sessionName = event.session;
    
    console.log(`[WAHA Session] Status alterado: ${status}`, {
      session: sessionName,
    });

    // Extrai userId da sessão e atualiza banco
    const userId = this.extractUserIdFromSession(sessionName);
    if (userId) {
      try {
        const whatsappSession = await prisma.whatsAppSession.findFirst({
          where: { sessionId: sessionName },
        });

        if (whatsappSession) {
          await prisma.whatsAppSession.update({
            where: { id: whatsappSession.id },
            data: {
              status: status,
              phoneNumber: event.payload.me?.id?.replace('@c.us', '').replace('@lid', '') || whatsappSession.phoneNumber,
              profileName: event.payload.me?.pushName || whatsappSession.profileName,
            },
          });
          console.log(`[WAHA Session] Sessão ${sessionName} atualizada no banco`);
        }
      } catch (error) {
        console.error(`[WAHA Session] Erro ao atualizar sessão no banco:`, error);
      }
    }
    
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
      body: message.body,
      timestamp: message.timestamp,
    });

    // Extrai o número do contato (remove @c.us ou @lid)
    let phoneNumber = message.from?.replace('@c.us', '').replace('@lid', '');
    if (!phoneNumber) {
      console.log('[WAHA Message] Número do remetente não encontrado');
      return;
    }

    // Normaliza o número: remove tudo que não é dígito
    phoneNumber = phoneNumber.replace(/\D/g, '');
    
    // Se o número tem 10 ou 11 dígitos e não começa com 55, adiciona o DDI 55
    // Isso trata números brasileiros que podem chegar sem DDI
    if (phoneNumber.length >= 10 && !phoneNumber.startsWith('55')) {
      phoneNumber = '55' + phoneNumber;
    }

    console.log('[WAHA Message] Número normalizado:', phoneNumber);

    // Extrai o userId da sessão para filtrar confirmações
    const userId = this.extractUserIdFromSession(event.session);
    console.log('[WAHA Message] UserId extraído:', userId);

    // Tenta atualizar o contato com o número correto do WhatsApp
    if (userId) {
      try {
        // Busca contatos que possam corresponder a este número (mesmo sem DDI ou com DDI diferente)
        const existingContacts = await prisma.contact.findMany({
          where: { userId },
        });

        for (const contact of existingContacts) {
          const contactPhoneClean = contact.phone.replace(/\D/g, '');
          const messagePhoneClean = phoneNumber.replace(/\D/g, '');
          
          // Compara os últimos 10 dígitos
          if (contactPhoneClean.slice(-10) === messagePhoneClean.slice(-10)) {
            // Atualiza o contato com o número completo do WhatsApp
            await prisma.contact.update({
              where: { id: contact.id },
              data: { phone: phoneNumber },
            });
            console.log('[WAHA] Contato atualizado com número do WhatsApp:', contact.name, phoneNumber);

            // Também atualiza as confirmações pendentes deste contato
            await prisma.confirmation.updateMany({
              where: {
                contactName: contact.name,
                status: ConfirmationStatus.PENDING,
              },
              data: { contactPhone: phoneNumber },
            });
            console.log('[WAHA] Confirmações atualizadas para o contato:', contact.name);
            break;
          }
        }
        }
      } catch (error) {
        console.log('[WAHA] Erro ao atualizar contato:', error);
      }
    }

      // Detecta resposta do contato
      const responseText = message.body?.toLowerCase().trim() || '';
      
      console.log('[WAHA Confirmation] ===== DEBUG =====');
      console.log('[WAHA Confirmation] sessionName:', event.session);
      console.log('[WAHA Confirmation] userId extraído:', userId);
      console.log('[WAHA Confirmation] phoneNumber:', phoneNumber);

      // Palavras que indicam confirmação positiva
    const positiveResponses = ['sim', 'yes', 'confirmei', 'vou ir', 'confirmado', 'ok', 'claro', 'com certeza', 'presente'];
    // Palavras que indicam confirmação negativa
    const negativeResponses = ['não', 'nao', 'no', 'não vou', 'cancela', 'cancelado', 'não posso', 'vou faltar', 'não irei'];

    const isPositive = positiveResponses.some(word => responseText.includes(word));
    const isNegative = negativeResponses.some(word => responseText.includes(word));

    if (isPositive || isNegative) {
      console.log(`[WAHA Confirmation] Resposta detectada: ${responseText} (${isPositive ? 'POSITIVA' : 'NEGATIVA'}) para o número: ${phoneNumber}`);

      // Busca todas as confirmações pendentes do usuário
      // Primeiro tenta com o userId extraído da sessão
      let confirmations;
      try {
        confirmations = await prisma.confirmation.findMany({
          where: {
            status: ConfirmationStatus.PENDING,
            userId: userId || undefined,
          },
          orderBy: { createdAt: 'desc' },
        });
      } catch (error) {
        console.log('[WAHA Confirmation] Erro na query com userId:', error);
        // Tenta buscar todas as confirmações pendentes sem filtro de userId
        confirmations = await prisma.confirmation.findMany({
          where: {
            status: ConfirmationStatus.PENDING,
          },
          orderBy: { createdAt: 'desc' },
        });
      }

      // Normaliza o número de cada confirmação para comparar
      const normalizedConfirmations = confirmations.map(c => ({
        ...c,
        normalizedPhone: c.contactPhone.replace(/\D/g, ''),
      }));

      console.log('[WAHA Confirmation] Confirmations found:', normalizedConfirmations.length);
      console.log('[WAHA Confirmation] Normalized phone from message:', phoneNumber);
      console.log('[WAHA Confirmation] All confirmation phones:', normalizedConfirmations.map(c => c.normalizedPhone));

      // Função para verificar se dois números correspondem (compara últimos 10-11 dígitos)
      const phonesMatch = (phone1: string, phone2: string): boolean => {
        const clean1 = phone1.replace(/\D/g, '');
        const clean2 = phone2.replace(/\D/g, '');
        
        // Exact match
        if (clean1 === clean2) return true;
        
        // Compara últimos 11 dígitos (número brasileiro com DDI)
        if (clean1.slice(-11) === clean2.slice(-11)) return true;
        
        // Compara últimos 10 dígitos (número brasileiro sem DDI)
        if (clean1.slice(-10) === clean2.slice(-10)) return true;
        
        // Um termina com o outro
        if (clean1.endsWith(clean2) || clean2.endsWith(clean1)) return true;
        
        return false;
      };

      // Busca a confirmação com número correspondente
      const confirmation = normalizedConfirmations.find(c => 
        phonesMatch(c.normalizedPhone, phoneNumber)
      );

      if (confirmation) {
        const newStatus = isPositive ? ConfirmationStatus.CONFIRMED : ConfirmationStatus.DENIED;
        await prisma.confirmation.update({
          where: { id: confirmation.id },
          data: {
            status: newStatus,
            response: message.body,
            respondedAt: new Date(),
          },
        });
        console.log(`[WAHA Confirmation] ✅ Confirmação ${confirmation.id} atualizada para ${newStatus}`);
      } else {
        console.log(`[WAHA Confirmation] Nenhuma confirmação pendente encontrada para ${phoneNumber}`);
      }
    }
  }

  // Handler para confirmação de entrega (ack)
  private async handleMessageAck(event: WAHAWebhookEvent) {
    const { messageId: rawMessageId, ack } = event.payload;
    
    // Verifica se messageId existe
    if (!rawMessageId) {
      console.log('[WAHA Message ACK] messageId não encontrado no payload, ignorando');
      return;
    }
    
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
      
      // Verifica se o ID existe
      if (!rawMessageId) {
        console.log('[WAHA Message ANY] ID da mensagem não encontrado, ignorando');
        return;
      }
      
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
