import { sessionRepository } from './session.repository'
import { whatsappService } from '../../integrations/whatsapp/whatsapp.service'
import { env } from '../../config/env'

export const sessionService = {
  generateSessionName(userId: string): string {
    return whatsappService.getSessionName(userId)
  },

  async getOrCreate(userId: string) {
    try {
      return await sessionRepository.findByUser(userId)
    } catch {
      const sessionName = this.generateSessionName(userId)
      return sessionRepository.create(userId, sessionName)
    }
  },

  async start(userId: string) {
    const session = await this.getOrCreate(userId)
    const webhookUrl = env.WAHA_WEBHOOK_URL || `${env.BACKEND_URL}/waha/webhook`
    const result = await whatsappService.createOrStart(userId, webhookUrl)
    
    if (!result.success) {
      throw new Error(result.error || 'Erro ao iniciar sessão WAHA')
    }

    await sessionRepository.update(userId, { 
      status: this.mapWahaStatus(result.status || 'starting') 
    })
    
    return session
  },

  async getStatus(userId: string) {
    return whatsappService.getSessionStatus(userId)
  },

  async restartSession(userId: string): Promise<void> {
    console.log('[Session] Reiniciando sessão...')
    await whatsappService.delete(userId)
    await sessionRepository.delete(userId)
    console.log('[Session] Sessão deletada. Pronto para criar nova.')
  },

  async getQRCode(userId: string, retryCount = 0): Promise<{ qr?: string | null; connected?: boolean; message?: string; status?: string; isPairingCode?: boolean }> {
    const maxRetries = 2
    const webhookUrl = env.WAHA_WEBHOOK_URL || `${env.BACKEND_URL}/waha/webhook`
    
    try {
      const session = await this.getOrCreate(userId)
      
      const startResult = await whatsappService.createOrStart(userId, webhookUrl)
      
      if (!startResult.success) {
        if (startResult.error && startResult.error.includes('FAILED')) {
          console.log('[Session] Sessão falhou, reiniciando...')
          await this.restartSession(userId)
          
          if (retryCount < maxRetries) {
            return this.getQRCode(userId, retryCount + 1)
          }
        }
        throw new Error(startResult.error || 'Erro ao iniciar sessão WAHA')
      }

      if (startResult.status === 'WORKING') {
        return { qr: null, connected: true, message: 'WhatsApp já conectado!' }
      }

      const result = await whatsappService.getQRCode(userId)
      
      if (result.error) {
        if (result.error.includes('FAILED') || result.error.includes('not as expected')) {
          console.log('[Session] QR falhou, reiniciando...')
          await this.restartSession(userId)
          
          if (retryCount < maxRetries) {
            return this.getQRCode(userId, retryCount + 1)
          }
        }
        throw new Error(result.error)
      }

      return { 
        qr: result.qr, 
        status: startResult.status,
        isPairingCode: (result as any).isPairingCode 
      }
    } catch (error: any) {
      if (retryCount < maxRetries && (error.message?.includes('FAILED') || error.message?.includes('not as expected'))) {
        console.log('[Session] Erro detectado, tentanto novamente...')
        await this.restartSession(userId)
        return this.getQRCode(userId, retryCount + 1)
      }
      throw error
    }
  },

  async stop(userId: string) {
    const session = await sessionRepository.findByUser(userId)
    await whatsappService.disconnect(userId)
    return sessionRepository.update(userId, { status: 'stopped', qr_code: null })
  },

  async logout(userId: string) {
    await whatsappService.disconnect(userId)
    await sessionRepository.delete(userId)
    return { success: true, message: 'Sessão desconectada e removida' }
  },

  mapWahaStatus(wahaStatus?: string): 'stopped' | 'starting' | 'scan_qr_code' | 'working' | 'failed' {
    switch (wahaStatus) {
      case 'WORKING': return 'working'
      case 'SCAN_QR_CODE': return 'scan_qr_code'
      case 'STARTING': return 'starting'
      case 'FAILED': return 'failed'
      case 'STOPPED': return 'stopped'
      default: return 'starting'
    }
  },
}
