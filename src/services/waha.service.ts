import { supabase } from '../lib/supabase.js';

const WAHA_URL = process.env.WAHA_URL || process.env.WAHA_API_URL || 'https://waha1.ux.net.br';
const WAHA_API_KEY = process.env.WAHA_API_KEY || '';
const WAHA_SESSION = process.env.WAHA_SESSION || 'default';

const formatPhoneToChatId = (phone: string): string => {
  const cleanPhone = phone.replace(/\D/g, '');
  return `${cleanPhone}@c.us`;
};

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
      const chatId = formatPhoneToChatId(phone);
      
      const response = await fetch(`${this.baseUrl}/api/sendText`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          session: this.session,
          chatId: chatId,
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

  async getSessionStatus(): Promise<{ connected: boolean; status?: string; error?: string }> {
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

      const data = await response.json() as { session?: { status?: string } };
      return {
        connected: data.session?.status === 'WORKING',
        status: data.session?.status,
      };
    } catch (error) {
      return { connected: false, error: String(error) };
    }
  }

  async startSession(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sessions/${this.session}/start`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({}),
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
        `${this.baseUrl}/api/${this.session}/auth/qr`,
        {
          method: 'POST',
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        console.error('[WAHA] Erro ao obter QR:', await response.text());
        return null;
      }

      const data = await response.json();
      console.log('[WAHA] QR Response:', JSON.stringify(data, null, 2));
      
      // WAHA pode retornar diferentes formatos
      // { qr: { code: "..." } } ou { qr: { base64: "..." } }
      if (data.qr?.code) {
        return data.qr.code;
      }
      if (data.qr?.base64) {
        return data.qr.base64;
      }
      if (data.url) {
        return data.url;
      }
      
      return null;
    } catch (error) {
      console.error('[WAHA] Erro ao obter QR code:', error);
      return null;
    }
  }

  async logout(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/sessions/${this.session}/logout`,
        {
          method: 'POST',
          headers: this.getHeaders(),
        }
      );

      return response.ok;
    } catch (error) {
      console.error('[WAHA] Erro ao fazer logout:', error);
      return false;
    }
  }

  async restartSession(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/api/sessions/${this.session}/restart`,
        {
          method: 'POST',
          headers: this.getHeaders(),
        }
      );

      return response.ok;
    } catch (error) {
      console.error('[WAHA] Erro ao reiniciar sessão:', error);
      return false;
    }
  }

  async checkPhoneNumberExists(phone: string): Promise<{ exists: boolean; chatId?: string }> {
    try {
      const chatId = formatPhoneToChatId(phone);
      
      const response = await fetch(
        `${this.baseUrl}/api/contacts/check-exists?phone=${phone}&session=${this.session}`,
        {
          method: 'GET',
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        return { exists: false };
      }

      const data = await response.json() as { numberExists?: boolean; chatId?: string };
      return {
        exists: data.numberExists || false,
        chatId: data.chatId,
      };
    } catch (error) {
      console.error('[WAHA] Erro ao verificar número:', error);
      return { exists: false };
    }
  }
}

export const wahaService = new WahaService();
