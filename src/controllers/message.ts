import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.ts'
import { MessageType, MessageStatus } from '@prisma/client'
import { wahaService } from '../services/waha.ts'

export const getAllMessages = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).userId
    const { status, contactId } = req.query

    const where: any = { userId }

    if (status) {
      where.status = status as MessageStatus
    }

    if (contactId) {
      where.contactId = contactId as string
    }

    const messages = await prisma.message.findMany({
      where,
      include: {
        contact: {
          select: {
            name: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json(messages)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar mensagens' })
  }
}

export const getMessageById = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).userId
    const { id } = req.params

    const message = await prisma.message.findFirst({
      where: { id, userId },
      include: {
        contact: {
          select: {
            name: true,
            phone: true,
          },
        },
      },
    })

    if (!message) {
      res.status(404).json({ error: 'Mensagem não encontrada' })
      return
    }

    res.json(message)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar mensagem' })
  }
}

export const createMessage = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).userId
    const { content, contactId, type = 'TEXT', scheduledAt } = req.body

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, userId },
    })

    if (!contact) {
      res.status(404).json({ error: 'Contato não encontrado' })
      return
    }

    const messageStatus = scheduledAt
      ? MessageStatus.SCHEDULED
      : MessageStatus.PENDING

    const message = await prisma.message.create({
      data: {
        content,
        type: type as MessageType,
        status: messageStatus,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        userId,
        contactId,
      },
      include: {
        contact: {
          select: {
            name: true,
            phone: true,
          },
        },
      },
    })

    res.status(201).json(message)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar mensagem' })
  }
}

export const updateMessage = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).userId
    const { id } = req.params
    const { content, scheduledAt } = req.body

    const existingMessage = await prisma.message.findFirst({
      where: { id, userId },
    })

    if (!existingMessage) {
      res.status(404).json({ error: 'Mensagem não encontrada' })
      return
    }

    if (existingMessage.status === MessageStatus.SENT) {
      res
        .status(400)
        .json({ error: 'Não é possível editar mensagens já enviadas' })
      return
    }

    const message = await prisma.message.update({
      where: { id },
      data: {
        content,
        scheduledAt: scheduledAt
          ? new Date(scheduledAt)
          : existingMessage.scheduledAt,
      },
      include: {
        contact: {
          select: {
            name: true,
            phone: true,
          },
        },
      },
    })

    res.json(message)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar mensagem' })
  }
}

export const deleteMessage = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).userId
    const { id } = req.params

    const existingMessage = await prisma.message.findFirst({
      where: { id, userId },
    })

    if (!existingMessage) {
      res.status(404).json({ error: 'Mensagem não encontrada' })
      return
    }

    await prisma.message.delete({
      where: { id },
    })

    res.json({ message: 'Mensagem excluída com sucesso' })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir mensagem' })
  }
}

export const sendMessageNow = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).userId
    const { id } = req.params

    const message = await prisma.message.findFirst({
      where: { id, userId },
      include: {
        contact: true,
      },
    })

    if (!message) {
      res.status(404).json({ error: 'Mensagem não encontrada' })
      return
    }

    if (message.status === MessageStatus.SENT) {
      res.status(400).json({ error: 'Mensagem já foi enviada' })
      return
    }

    // Verifica se WAHA API está configurada
    const isConnected = await wahaService.checkConnection()
    if (!isConnected) {
      res.status(503).json({ 
        error: 'WhatsApp não conectado. Configure a WAHA API primeiro.',
        setup: 'Veja o arquivo WHATSAPP_SETUP.md'
      })
      return
    }

    // Envia mensagem via WhatsApp
    try {
      const sentMessage = await wahaService.sendTextMessage(
        message.contact.phone,
        message.content
      )

      // Atualiza status no banco com o externalId (ID do WhatsApp)
      const updatedMessage = await prisma.message.update({
        where: { id },
        data: {
          status: MessageStatus.SENT,
          sentAt: new Date(),
          externalId: sentMessage.id,
        },
        include: {
          contact: {
            select: {
              name: true,
              phone: true,
            },
          },
        },
      })

      res.json({
        message: updatedMessage,
        sent: true,
        via: 'whatsapp'
      })
    } catch (whatsappError: any) {
      // Se falhar no WhatsApp, marca como falha
      await prisma.message.update({
        where: { id },
        data: {
          status: MessageStatus.FAILED,
        },
      })

      res.status(500).json({ 
        error: 'Erro ao enviar mensagem via WhatsApp',
        details: whatsappError.message 
      })
    }
  } catch (error) {
    res.status(500).json({ error: 'Erro ao enviar mensagem' })
  }
}

// Verificar status da conexão com WhatsApp
export const checkWhatsAppStatus = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    console.log('[WhatsApp] Verificando status...')
    
    // Sempre tenta obter info da sessão, mesmo se não estiver conectado
    let sessionInfo = null
    let isConnected = false
    
    try {
      sessionInfo = await wahaService.getSessionInfo()
      console.log('[WhatsApp] Info da sessão:', sessionInfo)
      
      // Verifica se está conectado (WORKING)
      isConnected = sessionInfo?.status === 'WORKING'
    } catch (sessionError: any) {
      console.log('[WhatsApp] Sessão não existe ou erro:', sessionError.message)
      sessionInfo = null
      isConnected = false
    }

    res.json({
      connected: isConnected,
      session: sessionInfo,
      configured: !!(process.env.WAHA_API_URL && process.env.WAHA_API_KEY),
    })
  } catch (error: any) {
    console.error('[WhatsApp] Erro ao verificar status:', error)
    res.status(500).json({ 
      error: 'Erro ao verificar status',
      details: error.message 
    })
  }
}

// Enviar mensagem de teste
export const sendTestMessage = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).userId
    const { phone, message } = req.body

    if (!phone || !message) {
      res.status(400).json({ error: 'Telefone e mensagem são obrigatórios' })
      return
    }

    const isConnected = await wahaService.checkConnection()
    if (!isConnected) {
      res.status(503).json({ 
        error: 'WhatsApp não conectado',
        setup: 'Configure a WAHA API primeiro'
      })
      return
    }

    await wahaService.sendTextMessage(phone, message)

    res.json({
      sent: true,
      to: phone,
      message,
    })
  } catch (error: any) {
    res.status(500).json({ 
      error: 'Erro ao enviar mensagem de teste',
      details: error.message 
    })
  }
}

// Obter QR Code para conectar WhatsApp
export const getQRCode = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const qrData = await wahaService.getQRCode()
    
    res.json({
      qrCode: qrData.qrCode,
      status: qrData.status,
      configured: true,
    })
  } catch (error: any) {
    res.status(500).json({ 
      error: 'Erro ao obter QR Code',
      details: error.message,
      configured: !!(process.env.WAHA_API_URL && process.env.WAHA_API_KEY),
    })
  }
}

// Desconectar WhatsApp
export const disconnectWhatsApp = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    await wahaService.disconnect()
    res.json({ message: 'WhatsApp desconectado com sucesso' })
  } catch (error: any) {
    res.status(500).json({ 
      error: 'Erro ao desconectar WhatsApp',
      details: error.message 
    })
  }
}

// Iniciar sessão do WhatsApp
export const startWhatsAppSession = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    console.log('[WhatsApp] ==========================================')
    console.log('[WhatsApp] Iniciando processo de conexão...')
    console.log('[WhatsApp] ==========================================')
    
    // Cria a sessão na WAHA
    console.log('[WhatsApp] Passo 1: Criando sessão...')
    const session = await wahaService.createSession()
    console.log('[WhatsApp] Resultado criação:', JSON.stringify(session, null, 2))
    
    // Inicia a sessão
    console.log('[WhatsApp] Passo 2: Iniciando sessão...')
    const started = await wahaService.startSession()
    console.log('[WhatsApp] Resultado início:', JSON.stringify(started, null, 2))
    
    // Aguarda um pouco e tenta obter QR Code
    console.log('[WhatsApp] Passo 3: Aguardando 3 segundos...')
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    // Verifica status atual
    console.log('[WhatsApp] Passo 4: Verificando status final...')
    const sessionInfo = await wahaService.getSessionInfo()
    console.log('[WhatsApp] Status final:', JSON.stringify(sessionInfo, null, 2))
    
    console.log('[WhatsApp] ==========================================')
    console.log('[WhatsApp] Processo concluído!')
    console.log('[WhatsApp] ==========================================')
    
    res.json({
      success: true,
      session: sessionInfo,
      message: 'Sessão iniciada. Aguarde o QR Code se necessário.',
      dashboardUrl: 'https://waha1.ux.net.br/dashboard'
    })
  } catch (error: any) {
    console.error('[WhatsApp] ==========================================')
    console.error('[WhatsApp] ERRO:', error.message)
    console.error('[WhatsApp] Stack:', error.stack)
    console.error('[WhatsApp] ==========================================')
    res.status(500).json({ 
      error: 'Erro ao iniciar sessão do WhatsApp',
      details: error.message 
    })
  }
}
