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
    const isConnected = await wahaService.checkConnection()
    const sessionInfo = isConnected ? await wahaService.getSessionInfo() : null

    res.json({
      connected: isConnected,
      session: sessionInfo,
      configured: !!(process.env.WAHA_API_URL && process.env.WAHA_API_KEY),
    })
  } catch (error: any) {
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
    
    // Primeiro verifica o status atual
    console.log('[WhatsApp] Verificando status atual...')
    const currentSession = await wahaService.getSessionInfo()
    console.log('[WhatsApp] Status atual:', currentSession.status)
    
    // Se está em FAILED, deleta e recria completamente
    if (currentSession.status === 'FAILED') {
      console.log('[WhatsApp] Sessão em FAILED, deletando e recriando...')
      try {
        // Primeiro para a sessão
        await wahaService.disconnect()
        console.log('[WhatsApp] Sessão parada!')
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // Deleta a sessão completamente
        await wahaService.deleteSession()
        console.log('[WhatsApp] Sessão deletada!')
        await new Promise(resolve => setTimeout(resolve, 2000))
      } catch (deleteError) {
        console.log('[WhatsApp] Erro ao deletar (ignorando):', deleteError)
      }
      
      // Cria nova sessão
      console.log('[WhatsApp] Criando nova sessão...')
      await wahaService.createSession()
      console.log('[WhatsApp] Nova sessão criada!')
      
      // Inicia a sessão
      console.log('[WhatsApp] Iniciando nova sessão...')
      await wahaService.startSession()
      console.log('[WhatsApp] Sessão iniciada!')
    } else if (currentSession.status === 'STOPPED') {
      // Se está parada, inicia
      console.log('[WhatsApp] Sessão parada, iniciando...')
      await wahaService.startSession()
      console.log('[WhatsApp] Sessão iniciada!')
    } else if (currentSession.status === 'WORKING') {
      // Já está conectada
      console.log('[WhatsApp] Sessão já está conectada!')
      res.json({
        success: true,
        session: currentSession,
        message: 'WhatsApp já está conectado!',
        dashboardUrl: 'https://waha1.ux.net.br/dashboard'
      })
      return
    } else {
      // Qualquer outro status, tenta criar/iniciar
      console.log('[WhatsApp] Criando/iniciando sessão...')
      await wahaService.createSession()
      await wahaService.startSession()
    }
    
    // Aguarda um pouco para o status atualizar
    console.log('[WhatsApp] Aguardando 5 segundos para status atualizar...')
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // Verifica status final
    console.log('[WhatsApp] Verificando status final...')
    const sessionInfo = await wahaService.getSessionInfo()
    console.log('[WhatsApp] Status final:', sessionInfo.status)
    
    console.log('[WhatsApp] ==========================================')
    console.log('[WhatsApp] Processo concluído!')
    console.log('[WhatsApp] ==========================================')
    
    let message = 'Sessão iniciada.'
    if (sessionInfo.status === 'SCAN_QR_CODE') {
      message = 'QR Code disponível! Escaneie no Dashboard da WAHA.'
    } else if (sessionInfo.status === 'FAILED') {
      message = 'Erro ao conectar. Tente reiniciar ou verifique o Dashboard.'
    }
    
    res.json({
      success: true,
      session: sessionInfo,
      message: message,
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
