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

    const sessionName = wahaService.generateSessionName(userId);

    // Verifica se WAHA API está configurada
    const isConnected = await wahaService.checkConnection(sessionName)
    if (!isConnected) {
      res.status(503).json({ 
        error: 'WhatsApp não conectado. Configure a sessão primeiro.',
        setup: 'Acesse /api/whatsapp/status para verificar'
      })
      return
    }

    // Envia mensagem via WhatsApp
    try {
      const sentMessage = await wahaService.sendTextMessage(
        sessionName,
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

// Verificar status da conexão com WhatsApp do usuário
export const checkWhatsAppStatus = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).userId
    const sessionName = wahaService.generateSessionName(userId);
    
    const isConnected = await wahaService.checkConnection(sessionName)
    const sessionInfo = isConnected ? await wahaService.getSessionInfo(sessionName) : null

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

    const sessionName = wahaService.generateSessionName(userId);
    const isConnected = await wahaService.checkConnection(sessionName)
    
    if (!isConnected) {
      res.status(503).json({ 
        error: 'WhatsApp não conectado',
        setup: 'Configure a sessão primeiro'
      })
      return
    }

    await wahaService.sendTextMessage(sessionName, phone, message)

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

// Obter QR Code para conectar WhatsApp do usuário
export const getQRCode = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).userId
    const sessionName = wahaService.generateSessionName(userId);
    
    const qrData = await wahaService.getQRCode(sessionName)
    
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

// Desconectar WhatsApp do usuário
export const disconnectWhatsApp = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).userId
    const sessionName = wahaService.generateSessionName(userId);
    
    await wahaService.disconnect(sessionName)
    res.json({ message: 'WhatsApp desconectado com sucesso' })
  } catch (error: any) {
    res.status(500).json({ 
      error: 'Erro ao desconectar WhatsApp',
      details: error.message 
    })
  }
}

// Iniciar sessão do WhatsApp do usuário
export const startWhatsAppSession = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = (req as any).userId
    const sessionName = wahaService.generateSessionName(userId);
    
    console.log(`[WhatsApp User ${userId}] ==========================================`)
    console.log(`[WhatsApp User ${userId}] Iniciando processo de conexão...`)
    console.log(`[WhatsApp User ${userId}] ==========================================`)
    
    // Busca ou cria sessão no banco
    let session = await prisma.whatsAppSession.findFirst({
      where: { userId },
    });

    if (!session) {
      session = await prisma.whatsAppSession.create({
        data: {
          sessionId: sessionName,
          name: sessionName,
          userId,
          isDefault: true,
        },
      });
    }
    
    // Primeiro verifica o status atual
    console.log(`[WhatsApp User ${userId}] Verificando status atual...`)
    const currentSession = await wahaService.getSessionInfo(sessionName)
    console.log(`[WhatsApp User ${userId}] Status atual:`, currentSession.status)
    
    // Se está em FAILED, deleta e recria completamente
    if (currentSession.status === 'FAILED') {
      console.log(`[WhatsApp User ${userId}] Sessão em FAILED, deletando e recriando...`)
      try {
        await wahaService.disconnect(sessionName)
        console.log(`[WhatsApp User ${userId}] Sessão parada!`)
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        await wahaService.deleteSession(sessionName)
        console.log(`[WhatsApp User ${userId}] Sessão deletada!`)
        await new Promise(resolve => setTimeout(resolve, 2000))
      } catch (deleteError) {
        console.log(`[WhatsApp User ${userId}] Erro ao deletar (ignorando):`, deleteError)
      }
      
      console.log(`[WhatsApp User ${userId}] Criando nova sessão...`)
      await wahaService.createSession(sessionName)
      console.log(`[WhatsApp User ${userId}] Nova sessão criada!`)
      
      console.log(`[WhatsApp User ${userId}] Iniciando nova sessão...`)
      await wahaService.startSession(sessionName)
      console.log(`[WhatsApp User ${userId}] Sessão iniciada!`)
    } else if (currentSession.status === 'STOPPED') {
      console.log(`[WhatsApp User ${userId}] Sessão parada, iniciando...`)
      await wahaService.startSession(sessionName)
      console.log(`[WhatsApp User ${userId}] Sessão iniciada!`)
    } else if (currentSession.status === 'WORKING') {
      console.log(`[WhatsApp User ${userId}] Sessão já está conectada!`)
      res.json({
        success: true,
        session: currentSession,
        message: 'WhatsApp já está conectado!',
        dashboardUrl: process.env.WAHA_API_URL
      })
      return
    } else {
      console.log(`[WhatsApp User ${userId}] Criando/iniciando sessão...`)
      await wahaService.createSession(sessionName)
      await wahaService.startSession(sessionName)
    }
    
    console.log(`[WhatsApp User ${userId}] Aguardando 5 segundos para status atualizar...`)
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    console.log(`[WhatsApp User ${userId}] Verificando status final...`)
    const sessionInfo = await wahaService.getSessionInfo(sessionName)
    console.log(`[WhatsApp User ${userId}] Status final:`, sessionInfo.status)
    
    console.log(`[WhatsApp User ${userId}] ==========================================`)
    console.log(`[WhatsApp User ${userId}] Processo concluído!`)
    console.log(`[WhatsApp User ${userId}] ==========================================`)
    
    // Atualiza banco
    await prisma.whatsAppSession.update({
      where: { id: session.id },
      data: {
        status: sessionInfo.status || 'STARTING',
        phoneNumber: sessionInfo.me?.id?.replace('@c.us', '').replace('@lid', '') || null,
        profileName: sessionInfo.me?.pushName || null,
      },
    });
    
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
      dashboardUrl: process.env.WAHA_API_URL
    })
  } catch (error: any) {
    console.error(`[WhatsApp] ==========================================`)
    console.error(`[WhatsApp] ERRO:`, error.message)
    console.error(`[WhatsApp] Stack:`, error.stack)
    console.error(`[WhatsApp] ==========================================`)
    res.status(500).json({ 
      error: 'Erro ao iniciar sessão do WhatsApp',
      details: error.message 
    })
  }
}
