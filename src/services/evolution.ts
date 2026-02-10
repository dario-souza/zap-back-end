const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE_NAME = process.env.EVOLUTION_INSTANCE_NAME || 'zapreminder';

interface SendMessagePayload {
  number: string;
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

export class EvolutionService {
  private baseUrl: string;
  private apiKey: string;
  private instanceName: string;

  constructor() {
    this.baseUrl = EVOLUTION_API_URL || '';
    this.apiKey = EVOLUTION_API_KEY || '';
    this.instanceName = EVOLUTION_INSTANCE_NAME;
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
        'apikey': this.apiKey,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Evolution API error: ${error}`);
    }

    return response.json();
  }

  async sendTextMessage(phone: string, message: string): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('Evolution API não configurada. Verifique as variáveis de ambiente.');
    }

    // Remove caracteres não numéricos do telefone
    const cleanPhone = phone.replace(/\D/g, '');
    
    // Adiciona código do país se não tiver (assume Brasil 55)
    const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

    const payload: SendMessagePayload = {
      number: fullPhone,
      text: message,
    };

    return this.fetch(`/message/sendText/${this.instanceName}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async checkConnection(): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/instance/connectionState/${this.instanceName}`, {
        headers: {
          'apikey': this.apiKey,
        },
      });

      if (!response.ok) return false;

      const data = await response.json();
      // Verifica estado 'open' ou 'connected'
      return data.instance?.state === 'open' || data.instance?.state === 'connected' || data.state === 'open' || data.state === 'connected';
    } catch (error) {
      return false;
    }
  }

  async getInstanceInfo(): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('Evolution API não configurada');
    }

    return this.fetch(`/instance/connectionState/${this.instanceName}`);
  }

  // Criar instância na Evolution
  async createInstance(): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('Evolution API não configurada');
    }

    try {
      return await this.fetch('/instance/create', {
        method: 'POST',
        body: JSON.stringify({
          instanceName: this.instanceName,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
          token: this.apiKey,
          reject_call: true,
          groupsIgnore: true,
          alwaysOnline: true,
          readMessages: false,
          readStatus: false,
        }),
      });
    } catch (error: any) {
      // Se já existe, ignora o erro
      if (error.message.includes('already exists')) {
        return { message: 'Instância já existe' };
      }
      throw error;
    }
  }

  // Reiniciar instância para gerar novo QR Code
  async restartInstance(): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('Evolution API não configurada');
    }

    try {
      const response = await fetch(`${this.baseUrl}/instance/restart/${this.instanceName}`, {
        method: 'POST',
        headers: {
          'apikey': this.apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Erro ao reiniciar instância');
      }

      return response.json();
    } catch (error) {
      console.error('Erro ao reiniciar instância:', error);
      throw error;
    }
  }

  // Obter QR Code da instância com retry e fallback
  async getQRCode(maxRetries: number = 10): Promise<QRCodeResponse> {
    if (!this.isConfigured()) {
      throw new Error('Evolution API não configurada');
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Primeiro verifica se já está conectado
        const isConnected = await this.checkConnection();
        if (isConnected) {
          return {
            qrCode: null,
            status: 'connected',
            message: 'WhatsApp já está conectado!'
          };
        }

        // Tenta obter o QR Code pelo endpoint de conexão
        const response = await fetch(`${this.baseUrl}/instance/connect/${this.instanceName}`, {
          method: 'GET',
          headers: {
            'apikey': this.apiKey,
          },
        });

        if (!response.ok) {
          // Se não conseguiu, tenta criar a instância primeiro
          if (response.status === 404) {
            await this.createInstance();
            // Aguarda um pouco para a instância inicializar
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const data = await response.json();
        console.log('QR Code response:', JSON.stringify(data, null, 2));

        // Extrai o QR Code de diferentes formatos possíveis
        let qrCode: string | null = null;
        let pairingCode: string | null = null;
        let status = 'connecting';

        // Verifica vários campos possíveis
        if (data.code) {
          qrCode = data.code;
        } else if (data.base64) {
          qrCode = data.base64;
        } else if (data.qrcode?.base64) {
          qrCode = data.qrcode.base64;
        } else if (data.qrcode?.code) {
          qrCode = data.qrcode.code;
        }

        if (data.pairingCode) {
          pairingCode = data.pairingCode;
        }

        if (data.state || data.instance?.state) {
          status = data.state || data.instance?.state;
        }

        // Se não tem QR Code mas está conectando, aguarda e tenta novamente
        if (!qrCode && status === 'connecting' && attempt < maxRetries - 1) {
          console.log(`Aguardando QR Code... Tentativa ${attempt + 1}/${maxRetries}`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          continue;
        }

        // Se não conseguiu QR Code após várias tentativas, retorna instruções alternativas
        if (!qrCode && attempt >= maxRetries - 1) {
          return {
            qrCode: null,
            status,
            pairingCode,
            message: 'QR Code não disponível via API. Use o Manager do Evolution: http://localhost:8080/manager'
          };
        }

        return {
          qrCode,
          status,
          base64: data.base64,
          code: data.code,
          pairingCode,
        };

      } catch (error: any) {
        console.error(`Tentativa ${attempt + 1} falhou:`, error.message);
        lastError = error;
        
        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    // Se chegou aqui, não conseguiu obter o QR Code
    return {
      qrCode: null,
      status: 'error',
      message: 'Não foi possível obter QR Code. Acesse o Manager: http://localhost:8080/manager'
    };
  }

  // Desconectar instância
  async disconnect(): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('Evolution API não configurada');
    }

    return this.fetch(`/instance/logout/${this.instanceName}`, {
      method: 'DELETE',
    });
  }

  // Verificar estado da conexão em detalhes
  async getConnectionState(): Promise<{
    connected: boolean;
    state: string;
    instanceName: string;
    profile?: any;
  }> {
    if (!this.isConfigured()) {
      throw new Error('Evolution API não configurada');
    }

    try {
      const response = await fetch(`${this.baseUrl}/instance/connectionState/${this.instanceName}`, {
        headers: {
          'apikey': this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error('Erro ao verificar estado');
      }

      const data = await response.json();
      const state = data.instance?.state || data.state || 'unknown';
      
      return {
        connected: state === 'open' || state === 'connected',
        state,
        instanceName: data.instance?.instanceName || this.instanceName,
        profile: data.instance,
      };
    } catch (error) {
      console.error('Erro ao verificar estado:', error);
      throw error;
    }
  }

  // Método alternativo: obter QR Code via Manager URL
  getManagerUrl(): string {
    return `${this.baseUrl}/manager`;
  }
}

export const evolutionService = new EvolutionService();
