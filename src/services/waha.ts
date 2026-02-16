const WAHA_API_URL = process.env.WAHA_API_URL;
const WAHA_API_KEY = process.env.WAHA_API_KEY;
const WAHA_WEBHOOK_URL = process.env.WAHA_WEBHOOK_URL;

interface SendMessagePayload {
  session: string;
  chatId: string;
  text: string;
}

interface QRCodeResponse {
  qrCode: string | null;
  status: string;
  base64?: string;
  code?: string;
  pairingCode?: string;
  message?: string;
}

interface SessionConfig {
  name: string;
  config: {
    noweb?: {
      store: {
        enabled: boolean;
        fullSync: boolean;
      };
    };
    webhooks?: Array<{
      url: string;
      events: string[];
    }>;
    client?: {
      deviceName: string;
    };
  };
}

export class WAHAService {
  private baseUrl: string;
  private apiKey: string;
  private webhookUrl: string | undefined;

  constructor() {
    this.baseUrl = WAHA_API_URL || '';
    this.apiKey = WAHA_API_KEY || '';
    this.webhookUrl = WAHA_WEBHOOK_URL;
  }

  private isConfigured(): boolean {
    return !!(this.baseUrl && this.apiKey);
  }

  private async fetch(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.apiKey,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`WAHA API error: ${error}`);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  /**
   * Envia mensagem de texto usando uma sessão específica
   */
  async sendTextMessage(sessionName: string, phone: string, message: string): Promise<{ id: string; timestamp: number }> {
    if (!this.isConfigured()) {
      throw new Error('WAHA API não configurada. Verifique as variáveis de ambiente.');
    }

    const cleanPhone = phone.replace(/\D/g, '');
    const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    const chatId = `${fullPhone}@c.us`;

    const payload: SendMessagePayload = {
      session: sessionName,
      chatId: chatId,
      text: message,
    };

    const response = await this.fetch('/api/sendText', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    console.log('[WAHA] Resposta bruta do sendText:', JSON.stringify(response, null, 2));

    const messageId = response?.id || response?.key?.id || '';
    const timestamp = response?.timestamp || Date.now();
    
    console.log(`[WAHA] Mensagem enviada - ID: ${messageId}, Timestamp: ${timestamp}, Session: ${sessionName}`);
    
    return {
      id: messageId,
      timestamp: timestamp,
    };
  }

  /**
   * Verifica se uma sessão específica está conectada
   */
  async checkConnection(sessionName: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const session = await this.getSessionInfo(sessionName);
      return session.status === 'WORKING';
    } catch (error) {
      return false;
    }
  }

  /**
   * Obtém informações de uma sessão específica
   */
  async getSessionInfo(sessionName: string): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('WAHA API não configurada');
    }

    try {
      return await this.fetch(`/api/sessions/${sessionName}`);
    } catch (error: any) {
      if (error.message.includes('404') || error.message.includes('not found')) {
        return {
          name: sessionName,
          status: 'STOPPED',
          config: {},
        };
      }
      throw error;
    }
  }

  /**
   * Cria uma nova sessão no WAHA
   */
  async createSession(sessionName: string): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('WAHA API não configurada');
    }

    const config: SessionConfig = {
      name: sessionName,
      config: {
        noweb: {
          store: {
            enabled: true,
            fullSync: false,
          },
        },
        client: {
          deviceName: 'ZapReminder',
        },
      },
    };

    if (this.webhookUrl) {
      config.config.webhooks = [
        {
          url: this.webhookUrl,
          events: ['session.status', 'message', 'message.ack'],
        },
      ];
    }

    try {
      return await this.fetch('/api/sessions', {
        method: 'POST',
        body: JSON.stringify(config),
      });
    } catch (error: any) {
      if (error.message.includes('409') || error.message.includes('already exists') || error.message.includes('already')) {
        console.log(`Sessão ${sessionName} já existe, retornando informações atuais`);
        return this.getSessionInfo(sessionName);
      }
      throw error;
    }
  }

  /**
   * Inicia uma sessão específica
   */
  async startSession(sessionName: string): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('WAHA API não configurada');
    }

    try {
      return await this.fetch(`/api/sessions/${sessionName}/start`, {
        method: 'POST',
      });
    } catch (error: any) {
      if (error.message.includes('404') || error.message.includes('not found')) {
        await this.createSession(sessionName);
        return this.startSession(sessionName);
      }
      throw error;
    }
  }

  /**
   * Reinicia uma sessão específica
   */
  async restartSession(sessionName: string): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('WAHA API não configurada');
    }

    try {
      return await this.fetch(`/api/sessions/${sessionName}/restart`, {
        method: 'POST',
      });
    } catch (error: any) {
      if (error.message.includes('404') || error.message.includes('not found')) {
        await this.createSession(sessionName);
        return this.startSession(sessionName);
      }
      throw error;
    }
  }

  /**
   * Obtém QR Code de uma sessão específica
   */
  async getQRCode(sessionName: string): Promise<QRCodeResponse> {
    if (!this.isConfigured()) {
      throw new Error('WAHA API não configurada');
    }

    try {
      const isConnected = await this.checkConnection(sessionName);
      if (isConnected) {
        const session = await this.getSessionInfo(sessionName);
        return {
          qrCode: null,
          status: 'WORKING',
          message: 'WhatsApp já está conectado!',
          profile: session.me || null,
        };
      }

      const session = await this.getSessionInfo(sessionName);
      
      if (session.status === 'STOPPED') {
        await this.createSession(sessionName);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      try {
        const response = await fetch(`${this.baseUrl}/api/${sessionName}/auth/qr`, {
          headers: {
            'X-Api-Key': this.apiKey,
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          if (response.status === 404) {
            await this.createSession(sessionName);
            await new Promise(resolve => setTimeout(resolve, 3000));
            return this.getQRCode(sessionName);
          }
          
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        
        if (data.data) {
          return {
            qrCode: data.data,
            status: 'SCAN_QR_CODE',
            base64: data.data,
          };
        }

        return {
          qrCode: null,
          status: session.status || 'STARTING',
          message: 'Aguardando QR Code...'
        };

      } catch (error: any) {
        console.error('Erro ao obter QR:', error.message);
        
        if (session.status === 'SCAN_QR_CODE') {
          await this.restartSession(sessionName);
          await new Promise(resolve => setTimeout(resolve, 3000));
          return this.getQRCode(sessionName);
        }

        throw error;
      }

    } catch (error: any) {
      console.error('Erro ao obter QR Code:', error.message);
      return {
        qrCode: null,
        status: 'error',
        message: `Erro ao obter QR Code: ${error.message}`
      };
    }
  }

  /**
   * Obtém código de pareamento de uma sessão específica
   */
  async getPairingCode(sessionName: string, phoneNumber: string): Promise<string | null> {
    if (!this.isConfigured()) {
      throw new Error('WAHA API não configurada');
    }

    try {
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      const response = await fetch(`${this.baseUrl}/api/${sessionName}/auth/request-code`, {
        method: 'POST',
        headers: {
          'X-Api-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber: cleanPhone,
        }),
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.code || null;
    } catch (error) {
      console.error('Erro ao obter código de pareamento:', error);
      return null;
    }
  }

  /**
   * Desconecta uma sessão específica
   */
  async disconnect(sessionName: string): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('WAHA API não configurada');
    }

    try {
      return await this.fetch(`/api/sessions/${sessionName}/logout`, {
        method: 'POST',
      });
    } catch (error: any) {
      if (error.message.includes('404') || error.message.includes('not found')) {
        return { message: 'Sessão já estava desconectada' };
      }
      throw error;
    }
  }

  /**
   * Obtém estado de conexão detalhado de uma sessão
   */
  async getConnectionState(sessionName: string): Promise<{
    connected: boolean;
    state: string;
    sessionName: string;
    profile?: any;
  }> {
    if (!this.isConfigured()) {
      throw new Error('WAHA API não configurada');
    }

    try {
      const session = await this.getSessionInfo(sessionName);
      const status = session.status || 'STOPPED';
      
      return {
        connected: status === 'WORKING',
        state: status,
        sessionName: session.name || sessionName,
        profile: session.me || null,
      };
    } catch (error) {
      console.error('Erro ao verificar estado:', error);
      throw error;
    }
  }

  /**
   * Lista todas as sessões do WAHA
   */
  async listAllSessions(): Promise<any[]> {
    if (!this.isConfigured()) {
      throw new Error('WAHA API não configurada');
    }

    return this.fetch('/api/sessions?all=true');
  }

  /**
   * Deleta uma sessão específica
   */
  async deleteSession(sessionName: string): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('WAHA API não configurada');
    }

    try {
      return await this.fetch(`/api/sessions/${sessionName}`, {
        method: 'DELETE',
      });
    } catch (error: any) {
      if (error.message.includes('404') || error.message.includes('not found')) {
        return { message: 'Sessão já estava removida' };
      }
      throw error;
    }
  }

  /**
   * Para uma sessão específica (stop)
   */
  async stopSession(sessionName: string): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('WAHA API não configurada');
    }

    try {
      return await this.fetch(`/api/sessions/${sessionName}/stop`, {
        method: 'POST',
      });
    } catch (error: any) {
      if (error.message.includes('404') || error.message.includes('not found')) {
        return { message: 'Sessão não encontrada' };
      }
      throw error;
    }
  }

  /**
   * Gera um nome único de sessão baseado no ID do usuário
   */
  generateSessionName(userId: string): string {
    return `user_${userId}`;
  }

  getDashboardUrl(): string {
    return `${this.baseUrl}/dashboard`;
  }

  getSwaggerUrl(): string {
    return `${this.baseUrl}/swagger`;
  }
}

export const wahaService = new WAHAService();
