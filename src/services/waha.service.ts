import { supabase } from '../config/supabase.js';

const WAHA_URL = process.env.WAHA_URL || process.env.WAHA_API_URL || 'https://waha1.ux.net.br';
const WAHA_API_KEY = process.env.WAHA_API_KEY || '';

const formatPhoneToChatId = (phone: string): string => {
  const cleanPhone = phone.replace(/\D/g, '');
  return `${cleanPhone}@c.us`;
};

interface UserSession {
  id: string;
  user_id: string;
  session_name: string;
  status: string;
  phone?: string;
  push_name?: string;
}

export class WahaService {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = WAHA_URL;
    this.apiKey = WAHA_API_KEY;
  }

  private getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Api-Key': this.apiKey,
    };
  }

  private async getUserSession(userId: string): Promise<UserSession | null> {
    const { data, error } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return null;
    }
    return data as UserSession;
  }

  private async saveUserSession(userId: string, sessionName: string, status: string = 'PENDING'): Promise<void> {
    const existing = await this.getUserSession(userId);
    
    if (existing) {
      await supabase
        .from('user_sessions')
        .update({ 
          session_name: sessionName, 
          status,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);
    } else {
      await supabase
        .from('user_sessions')
        .insert({ 
          user_id: userId, 
          session_name: sessionName, 
          status 
        });
    }
  }

  private async updateUserSessionStatus(userId: string, status: string, phone?: string, pushName?: string): Promise<void> {
    await supabase
      .from('user_sessions')
      .update({ 
        status,
        phone,
        push_name: pushName,
        connected_at: status === 'WORKING' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);
  }

  private getSessionName(userId: string): string {
    return `user_${userId.substring(0, 8)}`;
  }

  async sendMessage(userId: string, phone: string, message: string): Promise<boolean> {
    const session = await this.getUserSession(userId);
    if (!session) {
      console.error('[WAHA] Sessão do usuário não encontrada');
      return false;
    }

    try {
      const chatId = formatPhoneToChatId(phone);
      
      const response = await fetch(`${this.baseUrl}/api/sendText`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          session: session.session_name,
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

  async getSessionStatus(userId: string): Promise<{ connected: boolean; status?: string; error?: string; phone?: string; pushName?: string }> {
    const session = await this.getUserSession(userId);
    if (!session) {
      return { connected: false, status: 'NOT_CREATED' };
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/api/sessions/${session.session_name}`,
        {
          method: 'GET',
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return { connected: false, status: 'NOT_CREATED' };
        }
        const errorText = await response.text();
        return { connected: false, error: errorText };
      }

      const data = await response.json() as { 
        status?: string; 
        me?: { id?: string; pushName?: string } 
      };
      
      const status = data.status;
      const phone = data.me?.id;
      const pushName = data.me?.pushName;

      // Atualiza status no banco
      await this.updateUserSessionStatus(userId, status || 'UNKNOWN', phone, pushName);

      return {
        connected: status === 'WORKING',
        status: status,
        phone: phone,
        pushName: pushName,
      };
    } catch (error) {
      return { connected: false, error: String(error) };
    }
  }

  async createOrStartSession(userId: string): Promise<{ success: boolean; status?: string; error?: string }> {
    const sessionName = this.getSessionName(userId);
    
    try {
      // 1. Verifica se a sessão já existe no WAHA
      const statusResponse = await fetch(
        `${this.baseUrl}/api/sessions/${sessionName}`,
        { method: 'GET', headers: this.getHeaders() }
      );

      if (statusResponse.ok) {
        const statusData = await statusResponse.json() as { status?: string; me?: { id?: string; pushName?: string } };
        const currentStatus = statusData.status;

        if (currentStatus === 'WORKING') {
          await this.updateUserSessionStatus(userId, 'WORKING', statusData.me?.id, statusData.me?.pushName);
          return { success: true, status: 'WORKING' };
        }

        // Se precisa de QR Code ou está Starting
        if (currentStatus === 'SCAN_QR_CODE' || currentStatus === 'STARTING' || currentStatus === 'FAILED') {
          await this.saveUserSession(userId, sessionName, currentStatus || 'PENDING');
          return { success: true, status: currentStatus };
        }

        // Se está stopped, inicia
        if (currentStatus === 'STOPPED') {
          const startResponse = await fetch(
            `${this.baseUrl}/api/sessions/${sessionName}/start`,
            { method: 'POST', headers: this.getHeaders() }
          );

          if (!startResponse.ok) {
            const error = await startResponse.text();
            return { success: false, error };
          }

          const startData = await startResponse.json() as { status?: string };
          const newStatus = startData.status || 'STARTING';
          await this.saveUserSession(userId, sessionName, newStatus);
          return { success: true, status: newStatus };
        }

        await this.saveUserSession(userId, sessionName, currentStatus || 'PENDING');
        return { success: true, status: currentStatus };
      }

      // 2. Sessão não existe - cria uma nova com NOWEB
      if (statusResponse.status === 404) {
        console.log('[WAHA] Criando nova sessão:', sessionName);
        
        const createResponse = await fetch(`${this.baseUrl}/api/sessions`, {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            name: sessionName,
            start: true,
            config: {
              noweb: {
                store: {
                  enabled: true,
                }
              }
            }
          }),
        });

        if (!createResponse.ok) {
          const error = await createResponse.text();
          console.error('[WAHA] Erro ao criar sessão:', error);
          return { success: false, error };
        }

        const createData = await createResponse.json() as { status?: string };
        console.log('[WAHA] Sessão criada, resposta:', createData);
        
        const newStatus = createData.status || 'STARTING';
        
        await this.saveUserSession(userId, sessionName, newStatus);
        return { success: true, status: newStatus };
      }

      // Outro erro
      const error = await statusResponse.text();
      return { success: false, error };

    } catch (error) {
      console.error('[WAHA] Erro ao criar/iniciar sessão:', error);
      return { success: false, error: String(error) };
    }
  }

  async getQRCode(userId: string): Promise<{ qr?: string; error?: string; isPairingCode?: boolean }> {
    const session = await this.getUserSession(userId);
    if (!session) {
      return { error: 'Sessão não encontrada. Crie uma sessão primeiro.' };
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/api/${session.session_name}/auth/qr`,
        {
          method: 'GET',
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.error('[WAHA] Erro ao obter QR:', error);
        return { error };
      }

      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('image/png')) {
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        console.log('[WAHA] QR Response (PNG): imagem obtida com sucesso');
        return { qr: `data:image/png;base64,${base64}`, isPairingCode: false };
      }
      
      if (contentType.includes('application/json')) {
        const data = await response.json() as any;
        console.log('[WAHA] QR Response (JSON):', JSON.stringify(data, null, 2));
        
        if (data.url) {
          return { qr: data.url };
        }
        if (data.base64) {
          return { qr: data.base64 };
        }
        if (data.code) {
          return { qr: data.code };
        }
        if (data.value) {
          return { qr: data.value, isPairingCode: true };
        }
        if (data.data && data.mimetype === 'image/png') {
          return { qr: `data:image/png;base64,${data.data}`, isPairingCode: false };
        }
      }
      
      return { error: 'QR Code não disponível' };
    } catch (error) {
      console.error('[WAHA] Erro ao obter QR code:', error);
      return { error: String(error) };
    }
  }

  async disconnect(userId: string): Promise<{ success: boolean; error?: string }> {
    const session = await this.getUserSession(userId);
    if (!session) {
      return { success: false, error: 'Sessão não encontrada' };
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/api/sessions/${session.session_name}/logout`,
        {
          method: 'POST',
          headers: this.getHeaders(),
        }
      );

      if (response.ok) {
        await this.updateUserSessionStatus(userId, 'DISCONNECTED');
        return { success: true };
      }

      const error = await response.text();
      return { success: false, error };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async checkPhoneNumberExists(userId: string, phone: string): Promise<{ exists: boolean; chatId?: string }> {
    const session = await this.getUserSession(userId);
    if (!session) {
      return { exists: false };
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/api/contacts/check-exists?phone=${phone}&session=${session.session_name}`,
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

  async deleteSession(userId: string): Promise<{ success: boolean; error?: string }> {
    const session = await this.getUserSession(userId);
    if (!session) {
      return { success: true };
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/api/sessions/${session.session_name}`,
        {
          method: 'DELETE',
          headers: this.getHeaders(),
        }
      );

      if (response.ok || response.status === 404) {
        return { success: true };
      }

      const error = await response.text();
      return { success: false, error };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }
}

export const wahaService = new WahaService();
