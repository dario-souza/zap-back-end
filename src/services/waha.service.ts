import { supabase } from '../lib/supabase.js';

const WAHA_URL = process.env.WAHA_URL || process.env.WAHA_API_URL || 'https://waha1.ux.net.br';
const WAHA_API_KEY = process.env.WAHA_API_KEY || '';
const WAHA_SESSION = process.env.WAHA_SESSION || 'default';

interface SendMessageResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class WahaService {
  private baseUrl: string;
  private apiKey: string;
  private session: string;

  constructor() {
    this.baseUrl = WAHA_URL;
    this.apiKey = WAHA_API_KEY;
    this.session = WAHA_SESSION;
  }

  private getHeaders() {
    return {
      'Content-Type': 'application/json',
      'X-Api-Key': this.apiKey,
    };
  }

  async sendMessage(phone: string, message: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sendText`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          session: this.session,
          to: phone,
          text: message,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[WAHA] Erro ao enviar mensagem:', error);
        return false;
      }

      const data = await response.json();
      console.log('[WAHA] Mensagem enviada:', data);
      return true;
    } catch (error) {
      console.error('[WAHA] Erro na requisição:', error);
      return false;
    }
  }

  async getSessionStatus() {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/sessions/${this.session}`,
        {
          method: 'GET',
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        return { connected: false, error: await response.text() };
      }

      const data = await response.json();
      return {
        connected: data.session?.status === 'LOADED',
        status: data.session?.status,
      };
    } catch (error) {
      return { connected: false, error: String(error) };
    }
  }

  async startSession(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sessions/start`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          session: this.session,
          config: {
            webhookUrl: process.env.WAHA_WEBHOOK_URL,
          },
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('[WAHA] Erro ao iniciar sessão:', error);
      return false;
    }
  }

  async getQRCode(): Promise<string | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/sessions/${this.session}/qr`,
        {
          method: 'GET',
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.qr?.code || null;
    } catch (error) {
      console.error('[WAHA] Erro ao obter QR code:', error);
      return null;
    }
  }

  async disconnect(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/sessions/${this.session}`,
        {
          method: 'DELETE',
          headers: this.getHeaders(),
        }
      );

      return response.ok;
    } catch (error) {
      console.error('[WAHA] Erro ao desconectar:', error);
      return false;
    }
  }
}

export const wahaService = new WahaService();
