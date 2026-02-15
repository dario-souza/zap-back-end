const WAHA_API_URL = process.env.WAHA_API_URL;
const WAHA_API_KEY = process.env.WAHA_API_KEY;
const WAHA_SESSION_NAME = process.env.WAHA_SESSION_NAME || 'default';
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
  private sessionName: string;
  private webhookUrl: string | undefined;

  constructor() {
    this.baseUrl = WAHA_API_URL || '';
    this.apiKey = WAHA_API_KEY || '';
    this.sessionName = WAHA_SESSION_NAME;
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

    // Alguns endpoints retornam 204 No Content
    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  async sendTextMessage(phone: string, message: string): Promise<{ id: string; timestamp: number }> {
    if (!this.isConfigured()) {
      throw new Error('WAHA API não configurada. Verifique as variáveis de ambiente.');
    }

    // Remove caracteres não numéricos do telefone
    const cleanPhone = phone.replace(/\D/g, '');
    
    // Adiciona código do país se não tiver (assume Brasil 55)
    const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
    
    // Formato WAHA: 5511999999999@c.us
    const chatId = `${fullPhone}@c.us`;

    const payload: SendMessagePayload = {
      session: this.sessionName,
      chatId: chatId,
      text: message,
    };

    const response = await this.fetch('/api/sendText', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    console.log('[WAHA] Resposta bruta do sendText:', JSON.stringify(response, null, 2));

    // Retorna o ID da mensagem para rastreamento de status
    const messageId = response?.id || response?.key?.id || '';
    const timestamp = response?.timestamp || Date.now();
    
    console.log(`[WAHA] Mensagem enviada - ID: ${messageId}, Timestamp: ${timestamp}`);
    
    return {
      id: messageId,
      timestamp: timestamp,
    };
  }

  async checkConnection(): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const session = await this.getSessionInfo();
      // Status WORKING = conectado
      return session.status === 'WORKING';
    } catch (error) {
      return false;
    }
  }

  async getSessionInfo(): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('WAHA API não configurada');
    }

    try {
      return await this.fetch(`/api/sessions/${this.sessionName}`);
    } catch (error: any) {
      // Se sessão não existe, retorna status parado
      if (error.message.includes('404') || error.message.includes('not found')) {
        return {
          name: this.sessionName,
          status: 'STOPPED',
          config: {},
        };
      }
      throw error;
    }
  }

  // Criar sessão na WAHA
  async createSession(): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('WAHA API não configurada');
    }

    const config: SessionConfig = {
      name: this.sessionName,
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

    // Adicionar webhook se configurado
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
      // Se já existe, retorna a sessão existente
      if (error.message.includes('409') || error.message.includes('already exists') || error.message.includes('already')) {
        console.log('Sessão já existe, retornando informações atuais');
        return this.getSessionInfo();
      }
      throw error;
    }
  }

  // Iniciar sessão
  async startSession(): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('WAHA API não configurada');
    }

    try {
      return await this.fetch(`/api/sessions/${this.sessionName}/start`, {
        method: 'POST',
      });
    } catch (error: any) {
      // Se sessão não existe, cria primeiro
      if (error.message.includes('404') || error.message.includes('not found')) {
        await this.createSession();
        return this.startSession();
      }
      throw error;
    }
  }

  // Reiniciar sessão para gerar novo QR Code
  async restartSession(): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('WAHA API não configurada');
    }

    try {
      return await this.fetch(`/api/sessions/${this.sessionName}/restart`, {
        method: 'POST',
      });
    } catch (error: any) {
      // Se sessão não existe, cria e inicia
      if (error.message.includes('404') || error.message.includes('not found')) {
        await this.createSession();
        return this.startSession();
      }
      throw error;
    }
  }

  // Obter QR Code da sessão
  async getQRCode(): Promise<QRCodeResponse> {
    if (!this.isConfigured()) {
      throw new Error('WAHA API não configurada');
    }

    try {
      // Primeiro verifica se já está conectado
      const isConnected = await this.checkConnection();
      if (isConnected) {
        return {
          qrCode: null,
          status: 'WORKING',
          message: 'WhatsApp já está conectado!'
        };
      }

      // Verifica status atual da sessão
      const session = await this.getSessionInfo();
      
      // Se está parada, cria e inicia
      if (session.status === 'STOPPED') {
        await this.createSession();
        // Aguarda inicialização
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Tenta obter QR Code
      try {
        // WAHA retorna QR como imagem base64
        const response = await fetch(`${this.baseUrl}/api/${this.sessionName}/auth/qr`, {
          headers: {
            'X-Api-Key': this.apiKey,
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          // Se não conseguiu QR, pode estar conectando ou precisa reiniciar
          if (response.status === 404) {
            // Sessão não existe, criar
            await this.createSession();
            await new Promise(resolve => setTimeout(resolve, 3000));
            return this.getQRCode();
          }
          
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        
        // WAHA retorna base64 diretamente em data.data
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
        
        // Se está em SCAN_QR_CODE mas não conseguiu QR, tenta reiniciar
        if (session.status === 'SCAN_QR_CODE') {
          await this.restartSession();
          await new Promise(resolve => setTimeout(resolve, 3000));
          return this.getQRCode();
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

  // Obter código de pareamento (alternativa ao QR)
  async getPairingCode(phoneNumber: string): Promise<string | null> {
    if (!this.isConfigured()) {
      throw new Error('WAHA API não configurada');
    }

    try {
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      const response = await fetch(`${this.baseUrl}/api/${this.sessionName}/auth/request-code`, {
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

  // Desconectar sessão (logout)
  async disconnect(): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('WAHA API não configurada');
    }

    try {
      return await this.fetch(`/api/sessions/${this.sessionName}/logout`, {
        method: 'POST',
      });
    } catch (error: any) {
      // Se sessão não existe, considera como desconectado
      if (error.message.includes('404') || error.message.includes('not found')) {
        return { message: 'Sessão já estava desconectada' };
      }
      throw error;
    }
  }

  // Verificar estado da conexão em detalhes
  async getConnectionState(): Promise<{
    connected: boolean;
    state: string;
    sessionName: string;
    profile?: any;
  }> {
    if (!this.isConfigured()) {
      throw new Error('WAHA API não configurada');
    }

    try {
      const session = await this.getSessionInfo();
      const status = session.status || 'STOPPED';
      
      return {
        connected: status === 'WORKING',
        state: status,
        sessionName: session.name || this.sessionName,
        profile: session.me || null,
      };
    } catch (error) {
      console.error('Erro ao verificar estado:', error);
      throw error;
    }
  }

  // Listar todas as sessões
  async listSessions(): Promise<any[]> {
    if (!this.isConfigured()) {
      throw new Error('WAHA API não configurada');
    }

    return this.fetch('/api/sessions?all=true');
  }

  // Deletar sessão
  async deleteSession(): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('WAHA API não configurada');
    }

    try {
      return await this.fetch(`/api/sessions/${this.sessionName}`, {
        method: 'DELETE',
      });
    } catch (error: any) {
      // Se sessão não existe, considera como deletada
      if (error.message.includes('404') || error.message.includes('not found')) {
        return { message: 'Sessão já estava removida' };
      }
      throw error;
    }
  }

  // URL do Dashboard WAHA
  getDashboardUrl(): string {
    return `${this.baseUrl}/dashboard`;
  }

  // URL do Swagger
  getSwaggerUrl(): string {
    return `${this.baseUrl}/swagger`;
  }
}

export const wahaService = new WAHAService();
