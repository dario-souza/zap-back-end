import { supabase } from '../../config/supabase'
import { env } from '../../config/env'

const WAHA_URL = env.WAHA_URL || 'https://waha1.ux.net.br'
const WAHA_API_KEY = env.WAHA_API_KEY || ''

const formatPhoneToChatId = (phone: string): string => {
  const cleanPhone = phone.replace(/\D/g, '')
  return `${cleanPhone}@c.us`
}

interface UserSession {
  id: string
  user_id: string
  session_name: string
  status: string
  phone?: string
  push_name?: string
}

const getHeaders = () => {
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Api-Key': WAHA_API_KEY,
  }
}

const getUserSession = async (userId: string): Promise<UserSession | null> => {
  const { data, error } = await supabase
    .from('user_sessions')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    return null
  }
  return data as UserSession
}

const saveUserSession = async (userId: string, sessionName: string, status: string = 'PENDING'): Promise<void> => {
  const existing = await getUserSession(userId)
  
  if (existing) {
    await supabase
      .from('user_sessions')
      .update({ 
        session_name: sessionName, 
        status,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
  } else {
    await supabase
      .from('user_sessions')
      .insert({ 
        user_id: userId, 
        session_name: sessionName, 
        status 
      })
  }
}

const updateUserSessionStatus = async (userId: string, status: string, phone?: string, pushName?: string): Promise<void> => {
  await supabase
    .from('user_sessions')
    .update({ 
      status,
      phone,
      push_name: pushName,
      connected_at: status === 'WORKING' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
}

export const whatsappService = {
  getSessionName(userId: string): string {
    return `user_${userId.replace(/-/g, '_').substring(0, 40)}`
  },

  async send(sessionName: string, phone: string, content: string): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const chatId = formatPhoneToChatId(phone)

      const statusCheck = await fetch(`${WAHA_URL}/api/sessions/${sessionName}`, {
        method: 'GET',
        headers: getHeaders(),
      })

      if (!statusCheck.ok) {
        const error = await statusCheck.text()
        console.error('[WAHA] Erro ao verificar sessão:', error)
        return { success: false, error: 'Sessão não encontrada. Crie uma sessão primeiro escaneando o QR code.' }
      }

      const statusData = await statusCheck.json() as { status?: string }
      
      if (statusData.status !== 'WORKING') {
        const statusMessage = {
          'STOPPED': 'Sessão está parada. Inicie a sessão.',
          'STARTING': 'Sessão está iniciando. Aguarde...',
          'SCAN_QR_CODE': 'Sessão precisa de QR code. Escaneie o código.',
          'FAILED': 'Sessão falhou. Recrie a sessão escaneando um novo QR code.',
        }
        return { 
          success: false, 
          error: statusMessage[statusData.status as keyof typeof statusMessage] || `Sessão está com status: ${statusData.status}` 
        }
      }
      
      const response = await fetch(`${WAHA_URL}/api/sendText`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          session: sessionName,
          chatId: chatId,
          text: content,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        console.error('[WAHA] Erro ao enviar mensagem:', error)
        return { success: false, error }
      }

      const data = await response.json() as { key?: { id?: string } }
      console.log('[WAHA] Mensagem enviada:', data)
      return { success: true, id: data.key?.id }
    } catch (error) {
      console.error('[WAHA] Erro na requisição:', error)
      return { success: false, error: String(error) }
    }
  },

  async getSessionStatus(userId: string): Promise<{ connected: boolean; status?: string; error?: string; phone?: string; pushName?: string }> {
    const session = await getUserSession(userId)
    if (!session) {
      return { connected: false, status: 'NOT_CREATED' }
    }

    try {
      const response = await fetch(
        `${WAHA_URL}/api/sessions/${session.session_name}`,
        {
          method: 'GET',
          headers: getHeaders(),
        }
      )

      if (!response.ok) {
        if (response.status === 404) {
          return { connected: false, status: 'NOT_CREATED' }
        }
        const errorText = await response.text()
        return { connected: false, error: errorText }
      }

      const data = await response.json() as { 
        status?: string; 
        me?: { id?: string; pushName?: string } 
      }
      
      const status = data.status
      const phone = data.me?.id
      const pushName = data.me?.pushName

      await updateUserSessionStatus(userId, status || 'UNKNOWN', phone, pushName)

      return {
        connected: status === 'WORKING',
        status: status,
        phone: phone,
        pushName: pushName,
      }
    } catch (error) {
      return { connected: false, error: String(error) }
    }
  },

  async createOrStart(userId: string, webhookUrl?: string): Promise<{ success: boolean; status?: string; error?: string }> {
    const sessionName = this.getSessionName(userId)
    
    try {
      const statusResponse = await fetch(
        `${WAHA_URL}/api/sessions/${sessionName}`,
        { method: 'GET', headers: getHeaders() }
      )

      if (statusResponse.ok) {
        const statusData = await statusResponse.json() as { status?: string; me?: { id?: string; pushName?: string } }
        const currentStatus = statusData.status

        if (currentStatus === 'WORKING') {
          await updateUserSessionStatus(userId, 'WORKING', statusData.me?.id, statusData.me?.pushName)
          return { success: true, status: 'WORKING' }
        }

        if (currentStatus === 'SCAN_QR_CODE' || currentStatus === 'STARTING') {
          await saveUserSession(userId, sessionName, currentStatus || 'PENDING')
          return { success: true, status: currentStatus }
        }

        if (currentStatus === 'FAILED' || currentStatus === 'STOPPED') {
          const startBody: any = { start: true }
          
          if (webhookUrl) {
            startBody.config = {
              webhooks: [{
                url: webhookUrl,
                events: ['session.status', 'message', 'message.any', 'message.ack'],
                retries: {
                  policy: 'constant',
                  delaySeconds: 2,
                  attempts: 5,
                },
              }]
            }
          }
          
          const startResponse = await fetch(
            `${WAHA_URL}/api/sessions/${sessionName}/start`,
            {
              method: 'POST',
              headers: getHeaders(),
              body: JSON.stringify(startBody)
            }
          )

          if (!startResponse.ok) {
            const error = await startResponse.text()
            return { success: false, error }
          }

          const startData = await startResponse.json() as { status?: string }
          const newStatus = startData.status || 'STARTING'
          await saveUserSession(userId, sessionName, newStatus)
          return { success: true, status: newStatus }
        }

        await saveUserSession(userId, sessionName, currentStatus || 'PENDING')
        return { success: true, status: currentStatus }
      }

      if (statusResponse.status === 404) {
        console.log('[WAHA] Criando nova sessão:', sessionName)

        const webhookConfig = [{
          url: webhookUrl,
          events: ['session.status', 'message', 'message.any', 'message.ack'],
          retries: {
            policy: 'constant',
            delaySeconds: 2,
            attempts: 5,
          },
        }]
        
        const createResponse = await fetch(`${WAHA_URL}/api/sessions`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            name: sessionName,
            start: true,
            config: {
              noweb: {
                store: {
                  enabled: true,
                }
              },
              webhooks: webhookConfig
            }
          }),
        })

        if (!createResponse.ok) {
          const error = await createResponse.text()
          console.error('[WAHA] Erro ao criar sessão:', error)
          return { success: false, error }
        }

        const createData = await createResponse.json() as { status?: string }
        console.log('[WAHA] Sessão criada, resposta:', createData)
        
        const newStatus = createData.status || 'STARTING'
        
        await saveUserSession(userId, sessionName, newStatus)
        return { success: true, status: newStatus }
      }

      const error = await statusResponse.text()
      return { success: false, error }

    } catch (error) {
      console.error('[WAHA] Erro ao criar/iniciar sessão:', error)
      return { success: false, error: String(error) }
    }
  },

  async getQRCode(userId: string): Promise<{ qr?: string; error?: string; isPairingCode?: boolean }> {
    const session = await getUserSession(userId)
    if (!session) {
      return { error: 'Sessão não encontrada. Crie uma sessão primeiro.' }
    }

    try {
      const response = await fetch(
        `${WAHA_URL}/api/${session.session_name}/auth/qr`,
        {
          method: 'GET',
          headers: getHeaders(),
        }
      )

      if (!response.ok) {
        const error = await response.text()
        console.error('[WAHA] Erro ao obter QR:', error)
        return { error }
      }

      const contentType = response.headers.get('content-type') || ''
      
      if (contentType.includes('image/png')) {
        const buffer = await response.arrayBuffer()
        const base64 = Buffer.from(buffer).toString('base64')
        console.log('[WAHA] QR Response (PNG): imagem obtida com sucesso')
        return { qr: `data:image/png;base64,${base64}`, isPairingCode: false }
      }
      
      if (contentType.includes('application/json')) {
        const data = await response.json() as any
        console.log('[WAHA] QR Response (JSON):', JSON.stringify(data, null, 2))
        
        if (data.url) {
          return { qr: data.url }
        }
        if (data.base64) {
          return { qr: data.base64 }
        }
        if (data.code) {
          return { qr: data.code }
        }
        if (data.value) {
          return { qr: data.value, isPairingCode: true }
        }
        if (data.data && data.mimetype === 'image/png') {
          return { qr: `data:image/png;base64,${data.data}`, isPairingCode: false }
        }
      }
      
      return { error: 'QR Code não disponível' }
    } catch (error) {
      console.error('[WAHA] Erro ao obter QR code:', error)
      return { error: String(error) }
    }
  },

  async disconnect(userId: string): Promise<{ success: boolean; error?: string }> {
    const session = await getUserSession(userId)
    if (!session) {
      return { success: false, error: 'Sessão não encontrada' }
    }

    try {
      const response = await fetch(
        `${WAHA_URL}/api/sessions/${session.session_name}/logout`,
        {
          method: 'POST',
          headers: getHeaders(),
        }
      )

      if (response.ok) {
        await updateUserSessionStatus(userId, 'DISCONNECTED')
        return { success: true }
      }

      const error = await response.text()
      return { success: false, error }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  },

  async checkPhoneNumberExists(userId: string, phone: string): Promise<{ exists: boolean; chatId?: string }> {
    const session = await getUserSession(userId)
    if (!session) {
      return { exists: false }
    }

    try {
      const response = await fetch(
        `${WAHA_URL}/api/contacts/check-exists?phone=${phone}&session=${session.session_name}`,
        {
          method: 'GET',
          headers: getHeaders(),
        }
      )

      if (!response.ok) {
        return { exists: false }
      }

      const data = await response.json() as { numberExists?: boolean; chatId?: string }
      return {
        exists: data.numberExists || false,
        chatId: data.chatId,
      }
    } catch (error) {
      console.error('[WAHA] Erro ao verificar número:', error)
      return { exists: false }
    }
  },

  async delete(userId: string): Promise<{ success: boolean; error?: string }> {
    const session = await getUserSession(userId)
    if (!session) {
      return { success: true }
    }

    try {
      const response = await fetch(
        `${WAHA_URL}/api/sessions/${session.session_name}`,
        {
          method: 'DELETE',
          headers: getHeaders(),
        }
      )

      if (response.ok || response.status === 404) {
        return { success: true }
      }

      const error = await response.text()
      return { success: false, error }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  },

  async updateWebhook(sessionName: string, webhookUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(
        `${WAHA_URL}/api/sessions/${sessionName}`,
        {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({
            config: {
              webhooks: [{
                url: webhookUrl,
                events: ['session.status', 'message', 'message.any', 'message.ack'],
                retries: {
                  policy: 'exponential',
                  delaySeconds: 2,
                  attempts: 15,
                },
              }]
            }
          }),
        }
      )

      if (response.ok) {
        console.log('[WAHA] Webhook atualizado na sessão:', sessionName)
        return { success: true }
      }

      const error = await response.text()
      return { success: false, error }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  },
}
