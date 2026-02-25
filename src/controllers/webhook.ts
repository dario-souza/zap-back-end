import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.ts';
import { MessageStatus, ConfirmationStatus } from '@prisma/client';
import { wahaService } from '../services/waha.ts';

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
  // Método auxiliar para extrair texto da mensagem de diferentes formatos
  private extractMessageText(message: any): string | null {
    // Formato 1: message.body (texto simples)
    if (message.body) {
      return message.body;
    }
    
    // Formato 2: message.extendedTextMessage.text (mensagem com preview)
    if (message.message?.extendedTextMessage?.text) {
      return message.message.extendedTextMessage.text;
    }
    
    // Formato 3: message.conversation (mensagem direta)
    if (message.message?.conversation) {
      return message.message.conversation;
    }
    
    // Formato 4: message.imageMessage.caption
    if (message.message?.imageMessage?.caption) {
      return message.message.imageMessage.caption;
    }
    
    // Formato 5: message.videoMessage.caption
    if (message.message?.videoMessage?.caption) {
      return message.message.videoMessage.caption;
    }
    
    // Formato 6: message.documentMessage.caption
    if (message.message?.documentMessage?.caption) {
      return message.message.documentMessage.caption;
    }
    
    return null;
  }

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
      fromMe: message.fromMe,
      type: message.type,
      body: message.body,
      timestamp: message.timestamp,
    });

    // IGNORA mensagens enviadas por nós mesmos (fromMe: true)
    if (message.fromMe === true) {
      console.log('[WAHA Message] Mensagem enviada por nós mesmos, ignorando para confirmação');
      return;
    }

    // Extrai o texto da mensagem - suporta múltiplos formatos
    const messageText = this.extractMessageText(message);
    console.log('[WAHA Message] Texto extraído:', messageText);

    // Extrai o número do contato - pode vir como @c.us ou @s.whatsapp.net ou @lid
    // Tenta usar remoteJidAlt se disponível (número real do WhatsApp)
    const remoteJidAlt = message._data?.key?.remoteJidAlt || message.remoteJidAlt;
    const participant = message._data?.participant || message.participant;
    console.log('[WAHA Message] remoteJidAlt:', remoteJidAlt);
    console.log('[WAHA Message] participant:', participant);
    console.log('[WAHA Message] from completo:', message.from);
    
    // Prioridades: remoteJidAlt > participant > from
    let fromToUse = remoteJidAlt || participant || message.from;
    
    // Se for LID, tenta resolver usando a API do WAHA
    if (fromToUse?.includes('@lid')) {
      console.log('[WAHA Message] Número é LID, tentando resolver...');
      const resolvedPhone = await wahaService.resolveLidToPhone(event.session, fromToUse);
      if (resolvedPhone) {
        console.log('[WAHA Message] LID resolvido para:', resolvedPhone);
        fromToUse = resolvedPhone;
      } else {
        // Fallback: tenta extrair de outras fontes
        const altNumber = message._data?.key?.remoteJidAlt || 
                         message._data?.key?.id || 
                         message.id;
        if (altNumber && !altNumber.includes('@lid')) {
          console.log('[WAHA Message] Usando número alternativo:', altNumber);
          fromToUse = altNumber;
        }
      }
    }
    
    let phoneNumber = fromToUse?.replace('@c.us', '').replace('@s.whatsapp.net', '').replace('@lid', '').replace('@g.us', '');
    if (!phoneNumber) {
      console.log('[WAHA Message] Número do remetente não encontrado');
      return;
    }

    // Normaliza o número: remove tudo que não é dígito
    phoneNumber = phoneNumber.replace(/\D/g, '');
    
    console.log('[WAHA Message] Número original do WhatsApp:', phoneNumber);

    // Se o número tem 10 ou 11 dígitos e não começa com 55, adiciona o DDI 55
    if (phoneNumber.length >= 10 && !phoneNumber.startsWith('55')) {
      phoneNumber = '55' + phoneNumber;
    }

    console.log('[WAHA Message] Número normalizado:', phoneNumber);

    // Extrai o userId da sessão para filtrar confirmações
    const userId = this.extractUserIdFromSession(event.session);
    console.log('[WAHA Message] UserId extraído:', userId);

    // Detecta resposta do contato
    const responseText = messageText?.toLowerCase().trim() || '';
    
    console.log('[WAHA Confirmation] ===== DEBUG =====');
    console.log('[WAHA Confirmation] sessionName:', event.session);
    console.log('[WAHA Confirmation] userId extraído:', userId);
    console.log('[WAHA Confirmation] phoneNumber (WhatsApp):', phoneNumber);
    console.log('[WAHA Confirmation] responseText:', responseText);

    // Palavras que indicam confirmação positiva
    const positiveResponses = ['sim', 'yes', 'confirmei', 'vou ir', 'confirmado', 'ok', 'claro', 'com certeza', 'presente', 'vou', 'estou'];
    // Palavras que indicam confirmação negativa
    const negativeResponses = ['não', 'nao', 'no', 'não vou', 'cancela', 'cancelado', 'não posso', 'vou faltar', 'não irei', 'nao vou', 'nao posso'];

    // Detectar apenas respostas explícitas
    const isPositive = positiveResponses.some(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      return regex.test(responseText);
    });
    const isNegative = negativeResponses.some(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      return regex.test(responseText);
    });

    if (isPositive || isNegative) {
      console.log(`[WAHA Confirmation] Resposta detectada: "${responseText}" (${isPositive ? 'POSITIVA' : 'NEGATIVA'})`);

      // Busca todas as confirmações pendentes do usuário
      let confirmations = await prisma.confirmation.findMany({
        where: {
          status: ConfirmationStatus.PENDING,
          userId: userId || undefined,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (confirmations.length === 0) {
        console.log('[WAHA Confirmation] Nenhuma confirmação PENDING encontrada');
        // Tenta buscar sem filtro de userId para debug
        confirmations = await prisma.confirmation.findMany({
          where: {
            status: ConfirmationStatus.PENDING,
          },
          take: 10,
        });
        console.log('[WAHA Confirmation] Total de confirmações PENDING (sem filtro):', confirmations.length);
      }

      // Normaliza os números das confirmações para comparação
      const normalizedConfirmations = confirmations.map(c => ({
        ...c,
        normalizedPhone: c.contactPhone.replace(/\D/g, ''),
      }));

      console.log('[WAHA Confirmation] Confirmations found:', normalizedConfirmations.length);
      console.log('[WAHA Confirmation] Número do WhatsApp:', phoneNumber);
      console.log('[WAHA Confirmation] Números salvos:', normalizedConfirmations.map(c => c.normalizedPhone));

      // Se só há 1 confirmação pendente, atualiza diretamente (sem correspondência de número)
      // Isso resolve casos onde o LID não corresponde ao número salvo
      if (normalizedConfirmations.length === 1 && (isPositive || isNegative)) {
        const c = normalizedConfirmations[0];
        const newStatus = isPositive ? ConfirmationStatus.CONFIRMED : ConfirmationStatus.DENIED;
        await prisma.confirmation.update({
          where: { id: c.id },
          data: {
            status: newStatus,
            response: responseText,
            respondedAt: new Date(),
          },
        });
        console.log(`[WAHA Confirmation] ✅ Confirmação única atualizada para ${newStatus} (ID: ${c.id})`);
        return;
      }

      // BUSCA INTELIGENTE: tenta várias estratégias de correspondência
      let confirmation = null;
      
      for (const c of normalizedConfirmations) {
        const savedPhone = c.normalizedPhone;
        
        // Estratégia 1: correspondência exata
        if (savedPhone === phoneNumber) {
          console.log(`[WAHA Confirmation] ✅ Correspondência exata: ${savedPhone} === ${phoneNumber}`);
          confirmation = c;
          break;
        }
        
        // Estratégia 2: o número do WhatsApp termina com o número salvo (últimos dígitos)
        if (phoneNumber.endsWith(savedPhone) && savedPhone.length >= 8) {
          console.log(`[WAHA Confirmation] ✅ Correspondência por finais: ${phoneNumber} termina com ${savedPhone}`);
          confirmation = c;
          break;
        }
        
        // Estratégia 3: o número salvo termina com o número do WhatsApp
        if (savedPhone.endsWith(phoneNumber) && phoneNumber.length >= 8) {
          console.log(`[WAHA Confirmation] ✅ Correspondência por finais (inverso): ${savedPhone} termina com ${phoneNumber}`);
          confirmation = c;
          break;
        }

        // Estratégia 4: comparação dos últimos 10 dígitos
        const last10Saved = savedPhone.slice(-10);
        const last10WhatsApp = phoneNumber.slice(-10);
        if (last10Saved === last10WhatsApp) {
          console.log(`[WAHA Confirmation] ✅ Correspondência últimos 10 dígitos: ${last10Saved} === ${last10WhatsApp}`);
          confirmation = c;
          break;
        }

        // Estratégia 5: comparação dos últimos 8 dígitos
        const last8Saved = savedPhone.slice(-8);
        const last8WhatsApp = phoneNumber.slice(-8);
        if (last8Saved === last8WhatsApp) {
          console.log(`[WAHA Confirmation] ✅ Correspondência últimos 8 dígitos: ${last8Saved} === ${last8WhatsApp}`);
          confirmation = c;
          break;
        }

        // Estratégia 6: remover DDI e comparar (sem o 55 do Brasil)
        const phoneWithoutDDI = phoneNumber.replace(/^55/, '');
        const savedWithoutDDI = savedPhone.replace(/^55/, '');
        if (phoneWithoutDDI === savedWithoutDDI) {
          console.log(`[WAHA Confirmation] ✅ Correspondência sem DDI: ${phoneWithoutDDI} === ${savedWithoutDDI}`);
          confirmation = c;
          break;
        }

        // Estratégia 7: comparar sem DDI usando últimos dígitos
        const last10WithoutDDI = phoneWithoutDDI.slice(-10);
        const last10SavedWithoutDDI = savedWithoutDDI.slice(-10);
        if (last10WithoutDDI === last10SavedWithoutDDI && last10WithoutDDI.length >= 8) {
          console.log(`[WAHA Confirmation] ✅ Correspondência últimos 10 sem DDI: ${last10WithoutDDI} === ${last10SavedWithoutDDI}`);
          confirmation = c;
          break;
        }
      }

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
        console.log(`[WAHA Confirmation] ✅ Confirmação ${confirmation.id} atualizada para ${newStatus} (${confirmation.contactName})`);
      } else {
        console.log(`[WAHA Confirmation] ❌ Nenhuma confirmação encontrada para ${phoneNumber}`);
        console.log('[WAHA Confirmation] Tentou corresponder com:', normalizedConfirmations.map(c => c.normalizedPhone));
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
    
    console.log('[WAHA Message ANY] ====================================');
    console.log('[WAHA Message ANY] Payload:', JSON.stringify(payload, null, 2));
    console.log('[WAHA Message ANY] ID:', payload.id);
    console.log('[WAHA Message ANY] fromMe:', payload.fromMe);
    console.log('[WAHA Message ANY] ACK:', payload.ack, '| ACK Name:', payload.ackName);
    console.log('[WAHA Message ANY] ====================================');

    // Extrai o número do remetente/destinatário
    const from = payload.from || payload.remoteJid || payload.to || '';
    // Tenta usar remoteJidAlt se disponível (número real do WhatsApp)
    const remoteJidAlt = payload._data?.key?.remoteJidAlt || payload.remoteJidAlt;
    const participant = payload._data?.participant || payload.participant;
    console.log('[WAHA Message ANY] remoteJidAlt:', remoteJidAlt);
    console.log('[WAHA Message ANY] participant:', participant);
    console.log('[WAHA Message ANY] from completo:', from);
    
    // Prioridades: remoteJidAlt > participant > from
    let fromToUse = remoteJidAlt || participant || from;
    
    // Se for LID, tenta resolver usando a API do WAHA
    if (fromToUse?.includes('@lid')) {
      console.log('[WAHA Message ANY] Número é LID, tentando resolver...');
      const resolvedPhone = await wahaService.resolveLidToPhone(event.session, fromToUse);
      if (resolvedPhone) {
        console.log('[WAHA Message ANY] LID resolvido para:', resolvedPhone);
        fromToUse = resolvedPhone;
      } else {
        // Fallback: tenta extrair de outras fontes
        const altNumber = payload._data?.key?.remoteJidAlt || 
                         payload._data?.key?.id || 
                         payload.id;
        if (altNumber && !altNumber.includes('@lid')) {
          console.log('[WAHA Message ANY] Usando número alternativo:', altNumber);
          fromToUse = altNumber;
        }
      }
    }
    
    let phoneNumber = fromToUse?.replace('@c.us', '').replace('@s.whatsapp.net', '').replace('@lid', '').replace('@g.us', '');
    if (phoneNumber) {
      phoneNumber = phoneNumber.replace(/\D/g, '');
      if (phoneNumber.length >= 10 && !phoneNumber.startsWith('55')) {
        phoneNumber = '55' + phoneNumber;
      }
    }
    
    console.log('[WAHA Message ANY] Número extraído:', phoneNumber);

    // IGNORA mensagens enviadas por nós mesmos (fromMe: true)
    // Confirmações só devem ser processadas para mensagens RECEBDAS
    if (payload.fromMe === true) {
      console.log('[WAHA Message ANY] Mensagem enviada por nós mesmos, ignorando para confirmação');
      // Continua apenas para processar ACK (status de entrega)
    } else {
      // Detecta resposta de confirmação APENAS para mensagens recebidas
      const responseText = this.extractMessageText(payload) || '';
      const responseLower = responseText.toLowerCase().trim();
      
      console.log('[WAHA Message ANY] Texto da mensagem:', responseText);

      // Palavras de confirmação
      const positiveResponses = ['sim', 'yes', 'confirmei', 'vou ir', 'confirmado', 'ok', 'claro', 'com certeza', 'presente', 'vou', 'estou'];
      const negativeResponses = ['não', 'nao', 'no', 'não vou', 'cancela', 'cancelado', 'não posso', 'vou faltar', 'não irei', 'nao vou', 'nao posso'];

      const isPositive = positiveResponses.some(word => new RegExp(`\\b${word}\\b`, 'i').test(responseLower));
      const isNegative = negativeResponses.some(word => new RegExp(`\\b${word}\\b`, 'i').test(responseLower));

      // Se detectou resposta de confirmação
      if ((isPositive || isNegative) && phoneNumber) {
        console.log(`[WAHA Confirmation ANY] Resposta detectada: "${responseText}" (${isPositive ? 'POSITIVA' : 'NEGATIVA'}) para número: ${phoneNumber}`);

        // Extrai userId da sessão
        const userId = this.extractUserIdFromSession(event.session);

        // Busca confirmações pendentes
        let confirmations = await prisma.confirmation.findMany({
          where: {
            status: ConfirmationStatus.PENDING,
            userId: userId || undefined,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (confirmations.length === 0) {
          confirmations = await prisma.confirmation.findMany({
            where: { status: ConfirmationStatus.PENDING },
            take: 10,
          });
        }

        // Normaliza e busca correspondência
        const normalizedConfirmations = confirmations.map(c => ({
          ...c,
          normalizedPhone: c.contactPhone.replace(/\D/g, ''),
        }));

        console.log('[WAHA Confirmation ANY] Confirmations found:', normalizedConfirmations.length);
        console.log('[WAHA Confirmation ANY] Número do WhatsApp:', phoneNumber);
        console.log('[WAHA Confirmation ANY] Números salvos:', normalizedConfirmations.map(c => c.normalizedPhone));

        // Se só há 1 confirmação pendente, atualiza diretamente (sem correspondência de número)
        if (normalizedConfirmations.length === 1 && (isPositive || isNegative)) {
          const c = normalizedConfirmations[0];
          const newStatus = isPositive ? ConfirmationStatus.CONFIRMED : ConfirmationStatus.DENIED;
          await prisma.confirmation.update({
            where: { id: c.id },
            data: {
              status: newStatus,
              response: responseText,
              respondedAt: new Date(),
            },
          });
          console.log(`[WAHA Confirmation ANY] ✅ Confirmação única atualizada para ${newStatus} (ID: ${c.id})`);
          return;
        }

        // Busca correspondência
        let confirmation = null;
        for (const c of normalizedConfirmations) {
          const savedPhone = c.normalizedPhone;
          
          if (savedPhone === phoneNumber || 
              phoneNumber.endsWith(savedPhone) || 
              savedPhone.endsWith(phoneNumber) ||
              savedPhone.slice(-10) === phoneNumber.slice(-10) ||
              savedPhone.slice(-8) === phoneNumber.slice(-8)) {
            confirmation = c;
            break;
          }

          // Estratégia sem DDI
          const phoneWithoutDDI = phoneNumber.replace(/^55/, '');
          const savedWithoutDDI = savedPhone.replace(/^55/, '');
          if (phoneWithoutDDI === savedWithoutDDI) {
            console.log(`[WAHA Confirmation ANY] ✅ Correspondência sem DDI: ${phoneWithoutDDI} === ${savedWithoutDDI}`);
            confirmation = c;
            break;
          }

          // Últimos 10 sem DDI
          const last10WithoutDDI = phoneWithoutDDI.slice(-10);
          const last10SavedWithoutDDI = savedWithoutDDI.slice(-10);
          if (last10WithoutDDI === last10SavedWithoutDDI && last10WithoutDDI.length >= 8) {
            console.log(`[WAHA Confirmation ANY] ✅ Correspondência últimos 10 sem DDI: ${last10WithoutDDI} === ${last10SavedWithoutDDI}`);
            confirmation = c;
            break;
          }
        }

        if (confirmation) {
          const newStatus = isPositive ? ConfirmationStatus.CONFIRMED : ConfirmationStatus.DENIED;
          await prisma.confirmation.update({
            where: { id: confirmation.id },
            data: {
              status: newStatus,
              response: responseText,
              respondedAt: new Date(),
            },
          });
          console.log(`[WAHA Confirmation ANY] ✅ Confirmação ${confirmation.id} atualizada para ${newStatus}`);
          return; // Sai após processar a confirmação
        }
      }
    } // Fim do else - só processa confirmações para mensagens recebidas

    // Processa ACK (status de entrega) APENAS para mensagens enviadas por nós
    if (payload.fromMe) {
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
