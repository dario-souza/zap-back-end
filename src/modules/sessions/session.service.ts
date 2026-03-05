import { sessionRepository } from './session.repository.ts';
import { wahaService } from '../../services/waha.service.ts';

export const sessionService = {
  generateSessionName(userId: string): string {
    const shortId = userId.replace(/-/g, '').substring(0, 8);
    return `user_${shortId}`;
  },

  async getOrCreate(userId: string) {
    try {
      return await sessionRepository.findByUser(userId);
    } catch {
      const sessionName = this.generateSessionName(userId);
      return sessionRepository.create(userId, sessionName);
    }
  },

  async start(userId: string) {
    const session = await this.getOrCreate(userId);
    const result = await wahaService.createOrStartSession(userId);
    
    if (!result.success) {
      throw new Error(result.error || 'Erro ao iniciar sessão WAHA');
    }

    await sessionRepository.update(userId, { 
      status: this.mapWahaStatus(result.status || 'starting') 
    });
    
    return session;
  },

  async getStatus(userId: string) {
    return wahaService.getSessionStatus(userId);
  },

  async restartSession(userId: string): Promise<void> {
    console.log('[Session] Reiniciando sessão...');
    await wahaService.deleteSession(userId);
    await sessionRepository.delete(userId);
    console.log('[Session] Sessão deletada. Pronto para criar nova.');
  },

  async getQRCode(userId: string, retryCount = 0): Promise<{ qr?: string | null; connected?: boolean; message?: string; status?: string; isPairingCode?: boolean }> {
    const maxRetries = 2;
    
    try {
      const session = await this.getOrCreate(userId);
      
      const startResult = await wahaService.createOrStartSession(userId);
      
      if (!startResult.success) {
        // Verifica se é erro de sessão falhada
        if (startResult.error && startResult.error.includes('FAILED')) {
          console.log('[Session] Sessão falhou, reiniciando...');
          await this.restartSession(userId);
          
          if (retryCount < maxRetries) {
            return this.getQRCode(userId, retryCount + 1);
          }
        }
        throw new Error(startResult.error || 'Erro ao iniciar sessão WAHA');
      }

      if (startResult.status === 'WORKING') {
        return { qr: null, connected: true, message: 'WhatsApp já conectado!' };
      }

      const result = await wahaService.getQRCode(userId);
      
      if (result.error) {
        // Verifica se é erro de sessão falhada
        if (result.error.includes('FAILED') || result.error.includes('not as expected')) {
          console.log('[Session] QR falhou, reiniciando...');
          await this.restartSession(userId);
          
          if (retryCount < maxRetries) {
            return this.getQRCode(userId, retryCount + 1);
          }
        }
        throw new Error(result.error);
      }

      return { 
        qr: result.qr, 
        status: startResult.status,
        isPairingCode: (result as any).isPairingCode 
      };
    } catch (error: any) {
      if (retryCount < maxRetries && (error.message?.includes('FAILED') || error.message?.includes('not as expected'))) {
        console.log('[Session] Erro detectado, tentanto novamente...');
        await this.restartSession(userId);
        return this.getQRCode(userId, retryCount + 1);
      }
      throw error;
    }
  },

  async stop(userId: string) {
    const session = await sessionRepository.findByUser(userId);
    await wahaService.disconnect(userId);
    return sessionRepository.update(userId, { status: 'stopped', qr_code: null });
  },

  async logout(userId: string) {
    await wahaService.disconnect(userId);
    await sessionRepository.delete(userId);
    return { success: true, message: 'Sessão desconectada e removida' };
  },

  mapWahaStatus(wahaStatus?: string): 'stopped' | 'starting' | 'scan_qr_code' | 'working' | 'failed' {
    switch (wahaStatus) {
      case 'WORKING': return 'working';
      case 'SCAN_QR_CODE': return 'scan_qr_code';
      case 'STARTING': return 'starting';
      case 'FAILED': return 'failed';
      case 'STOPPED': return 'stopped';
      default: return 'starting';
    }
  },
};
