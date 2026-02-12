import type { Request, Response } from 'express';

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
  // Receber webhook da WAHA
  async handleWAHAWebhook(req: Request, res: Response) {
    try {
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
  }

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
    const { messageId, ack } = event.payload;
    console.log('[WAHA Message ACK] Status de entrega:', {
      messageId,
      ack, // 1 = enviado, 2 = entregue, 3 = lido
    });

    // Aqui você pode atualizar o status da mensagem no banco de dados
    // ack: 1 = sent, 2 = delivered, 3 = read
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
  getRecentEvents(req: Request, res: Response) {
    const limit = parseInt(req.query.limit as string) || 50;
    res.json({
      events: recentEvents.slice(0, limit),
      total: recentEvents.length,
    });
  }

  // Health check do webhook
  healthCheck(req: Request, res: Response) {
    res.json({
      status: 'ok',
      recentEvents: recentEvents.length,
      registeredCallbacks: Array.from(eventCallbacks.keys()).map(event => ({
        event,
        count: eventCallbacks.get(event)?.length || 0,
      })),
    });
  }
}

export const webhookController = new WebhookController();
