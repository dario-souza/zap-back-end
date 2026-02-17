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
    
    console.log(`[WAHA] Request: ${options.method || 'GET'} ${url}`);
    console.log(`[WAHA] Headers: X-Api-Key=${this.apiKey ? '***presente***' : '***AUSENTE***'}`);
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.apiKey,
        ...options.headers,
      },
    });

    console.log(`[WAHA] Response: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const error = await response.text();
      console.error(`[WAHA] Erro ${response.status}:`, error);
      throw new Error(`WAHA API error (${response.status}): ${error}`);
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

    console.log(`[WAHA] Criando sessão '${sessionName}' em ${this.baseUrl}...`);

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
      console.log(`[WAHA] Configurando webhook: ${this.webhookUrl}`);
      config.config.webhooks = [
        {
          url: this.webhookUrl,
          events: ['session.status', 'message', 'message.ack'],
        },
      ];
    }

    console.log('[WAHA] Payload:', JSON.stringify(config, null, 2));

    try {
      const result = await this.fetch('/api/sessions', {
        method: 'POST',
        body: JSON.stringify(config),
      });
      console.log('[WAHA] Sessão criada com sucesso:', result);
      return result;
    } catch (error: any) {
      console.error('[WAHA] Erro ao criar sessão:', error.message);
      // Se já existe, retorna a sessão existente
      if (error.message.includes('409') || error.message.includes('already exists') || error.message.includes('already')) {
        console.log('[WAHA] Sessão já existe, retornando informações atuais');
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

    console.log(`[WAHA] Iniciando sessão '${sessionName}'...`);

    try {
      const result = await this.fetch(`/api/sessions/${sessionName}/start`, {
        method: 'POST',
      });
      console.log('[WAHA] Sessão iniciada:', result);
      return result;
    } catch (error: any) {
      console.error('[WAHA] Erro ao iniciar sessão:', error.message);
      // Se sessão não existe, cria primeiro
      if (error.message.includes('404') || error.message.includes('not found')) {
        console.log('[WAHA] Sessão não encontrada, criando...');
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
      console.log('[WAHA] Iniciando obtenção do QR Code...');
      
      // Primeiro verifica se já está conectado
      const isConnected = await this.checkConnection(sessionName);
      console.log('[WAHA] Conectado?', isConnected);
      
      if (isConnected) {
        const session = await this.getSessionInfo(sessionName);
        return {
          qrCode: null,
          status: 'WORKING',
          message: 'WhatsApp já está conectado!',
          profile: session.me || null,
        };
      }

      // Verifica status atual da sessão
      const session = await this.getSessionInfo(sessionName);
      console.log('[WAHA] Status da sessão:', session.status);
      
      if (session.status === 'STOPPED') {
        console.log('[WAHA] Sessão parada, criando...');
        await this.createSession(sessionName);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      try {
        const qrUrl = `${this.baseUrl}/api/${sessionName}/auth/qr`;
        console.log('[WAHA] Buscando QR em:', qrUrl);
        
        // WAHA retorna QR como imagem base64
        const response = await fetch(qrUrl, {
          headers: {
            'X-Api-Key': this.apiKey,
            'Accept': 'application/json',
          },
        });

        console.log('[WAHA] Resposta QR:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[WAHA] Erro ao obter QR:', response.status, errorText);
          
          // Se não conseguiu QR, pode estar conectando ou precisa reiniciar
          if (response.status === 404) {
            console.log('[WAHA] Sessão não encontrada, criando...');
            await this.createSession(sessionName);
            await new Promise(resolve => setTimeout(resolve, 3000));
            return this.getQRCode(sessionName);
          }
          
          if (response.status === 422) {
            // Sessão ainda não está pronta para QR
            return {
              qrCode: null,
              status: 'STARTING',
              message: 'Sessão iniciando, aguarde...'
            };
          }
          
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        console.log('[WAHA] Dados QR recebidos:', data ? 'Sim' : 'Não');
        
        if (data.data) {
          console.log('[WAHA] QR Code obtido com sucesso!');
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
        console.error('[WAHA] Erro ao obter QR:', error.message);
        
        if (session.status === 'SCAN_QR_CODE') {
          console.log('[WAHA] Tentando reiniciar sessão...');
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
