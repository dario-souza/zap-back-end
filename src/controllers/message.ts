import type { Response } from 'express'
import { prisma } from '../lib/prisma.ts'
import { MessageType, MessageStatus, RecurrenceType } from '@prisma/client'
import { wahaService } from '../services/waha.ts'
import type { AuthRequest } from '../middlewares/auth.ts'
import { processTemplateVariables } from '../lib/utils.ts'

export const getAllMessages = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
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
      select: {
        id: true,
        content: true,
        type: true,
        status: true,
        scheduledAt: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        recurrenceType: true,
        contactIds: true,
        originalMessageId: true,
        isRecurringClone: true,
        reminderDays: true,
        reminderSent: true,
        isReminder: true,
        createdAt: true,
        updatedAt: true,
        contactId: true,
        userId: true,
        contact: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
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
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
    const { id } = req.params

    const message = await prisma.message.findFirst({
      where: { id, userId },
      include: {
        contact: {
          select: {
            name: true,
            phone: true,
            email: true,
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

// Criar mensagens em massa para múltiplos contatos
export const createBulkMessages = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
    const { 
      content, 
      contactIds, 
      type = 'TEXT', 
      scheduledAt, 
      sendNow = false,
      recurrenceType = RecurrenceType.NONE 
    } = req.body

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      res.status(400).json({ error: 'É necessário selecionar pelo menos um contato' })
      return
    }

    if (!content) {
      res.status(400).json({ error: 'O conteúdo da mensagem é obrigatório' })
      return
    }

    // Valida se todos os contatos existem e pertencem ao usuário
    const contacts = await prisma.contact.findMany({
      where: {
        id: { in: contactIds },
        userId,
      },
    })

    if (contacts.length !== contactIds.length) {
      res.status(400).json({ error: 'Um ou mais contatos não encontrados' })
      return
    }

    // Limite de 50 contatos por envio em massa
    if (contactIds.length > 50) {
      res.status(400).json({ error: 'Máximo de 50 contatos por envio em massa' })
      return
    }

    const messageStatus = sendNow 
      ? MessageStatus.PENDING 
      : (scheduledAt ? MessageStatus.SCHEDULED : MessageStatus.PENDING)

    // Criar uma mensagem para cada contato
    const messages = await Promise.all(
      contactIds.map((contactId: string) =>
        prisma.message.create({
          data: {
            content,
            type: type as MessageType,
            status: messageStatus,
            scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
            userId,
            contactId,
            contactIds: contactIds,
            recurrenceType: recurrenceType as RecurrenceType,
          },
          include: {
            contact: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true,
              },
            },
          },
        })
      )
    )

    // Se sendNow for true, enviar imediatamente
    if (sendNow) {
      const sessionName = wahaService.generateSessionName(userId)
      const isConnected = await wahaService.checkConnection(sessionName)
      
      if (!isConnected) {
        res.status(503).json({ 
          error: 'WhatsApp não conectado. Configure a sessão primeiro.',
          messages: messages,
          sent: false
        })
        return
      }

      const results = []
      for (const message of messages) {
        try {
          // Processa variáveis do template (nome, email)
          const processedContent = processTemplateVariables(
            message.content,
            message.contact
          )

          const sentMessage = await wahaService.sendTextMessage(
            sessionName,
            message.contact.phone,
            processedContent
          )
          
          await prisma.message.update({
            where: { id: message.id },
            data: {
              status: MessageStatus.SENT,
              sentAt: new Date(),
              externalId: sentMessage.id,
            },
          })
          
          results.push({ id: message.id, sent: true })
        } catch (err: any) {
          await prisma.message.update({
            where: { id: message.id },
            data: { status: MessageStatus.FAILED },
          })
          results.push({ id: message.id, sent: false, error: err.message })
        }
        
        // Delay de 2 segundos entre envios para evitar bloqueios
        await new Promise(resolve => setTimeout(resolve, 2000))
      }

      res.status(201).json({
        messages,
        results,
        sent: true,
        total: messages.length,
        successCount: results.filter((r: any) => r.sent).length,
      })
      return
    }

    res.status(201).json({
      messages,
      total: messages.length,
      scheduled: !!scheduledAt,
      recurrence: recurrenceType,
    })
  } catch (error: any) {
    console.error('[createBulkMessages] Erro:', error)
    res.status(500).json({ error: 'Erro ao criar mensagens em massa' })
  }
}

export const createMessage = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
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
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
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
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
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

export const deleteAllMessages = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id

    const { count } = await prisma.message.deleteMany({
      where: { userId },
    })

    res.json({ message: `${count} mensagens excluídas com sucesso` })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir mensagens' })
  }
}

export const sendMessageNow = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
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

    // Processa variáveis do template (nome, email)
    const processedContent = processTemplateVariables(
      message.content,
      message.contact
    )

    // Envia mensagem via WhatsApp
    try {
      const sentMessage = await wahaService.sendTextMessage(
        sessionName,
        message.contact.phone,
        processedContent
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
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
    
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' })
      return
    }
    
    const sessionName = wahaService.generateSessionName(userId)
    
    console.log('[WhatsApp] Verificando status...')
    console.log('[WhatsApp] Session:', sessionName)
    
    // Sempre tenta obter info da sessão, mesmo se não estiver conectado
    let sessionInfo = null
    let isConnected = false
    
    try {
      sessionInfo = await wahaService.getSessionInfo(sessionName)
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
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
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
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
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
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
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

// Iniciar sessão do WhatsApp
export const startWhatsAppSession = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
    
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' })
      return
    }
    
    const sessionName = wahaService.generateSessionName(userId)
    
    console.log('[WhatsApp] ==========================================')
    console.log('[WhatsApp] Iniciando processo de conexão...')
    console.log('[WhatsApp] Session:', sessionName)
    console.log('[WhatsApp] ==========================================')
    
    // Primeiro verifica o status atual
    console.log('[WhatsApp] Verificando status atual...')
    const currentSession = await wahaService.getSessionInfo(sessionName)
    console.log('[WhatsApp] Status atual:', currentSession.status)
    
    // Se está em FAILED, precisa reiniciar
    if (currentSession.status === 'FAILED') {
      console.log('[WhatsApp] Sessão em FAILED, reiniciando...')
      await wahaService.restartSession(sessionName)
      console.log('[WhatsApp] Sessão reiniciada!')
    } else if (currentSession.status === 'STOPPED') {
      // Se está parada, inicia
      console.log('[WhatsApp] Sessão parada, iniciando...')
      await wahaService.startSession(sessionName)
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
      await wahaService.createSession(sessionName)
      await wahaService.startSession(sessionName)
    }
    
    // Aguarda um pouco para o status atualizar
    console.log('[WhatsApp] Aguardando 5 segundos para status atualizar...')
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // Verifica status final
    console.log('[WhatsApp] Verificando status final...')
    const sessionInfo = await wahaService.getSessionInfo(sessionName)
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

export const createMessageWithReminder = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
    const { content, contactId, scheduledAt, reminderDays } = req.body

    if (!content) {
      res.status(400).json({ error: 'O conteúdo da mensagem é obrigatório' })
      return
    }

    if (!contactId) {
      res.status(400).json({ error: 'Selecione um contato' })
      return
    }

    if (!scheduledAt) {
      res.status(400).json({ error: 'Defina a data do evento' })
      return
    }

    if (!reminderDays || ![1, 2].includes(reminderDays)) {
      res.status(400).json({ error: 'Defina quantos dias antes deve enviar o lembrete (1 ou 2)' })
      return
    }

    const contact = await prisma.contact.findFirst({
      where: { id: contactId, userId },
    })

    if (!contact) {
      res.status(404).json({ error: 'Contato não encontrado' })
      return
    }

    // A data do evento é a data real do agendamento
    const eventDate = new Date(scheduledAt)
    
    // O lembrete é enviado X dias ANTES do evento
    const reminderDate = new Date(eventDate)
    reminderDate.setDate(reminderDate.getDate() - reminderDays)

    // Formata a data do evento para incluir na mensagem
    const eventDateStr = eventDate.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    const eventTimeStr = eventDate.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })

    // Cria apenas a mensagem de lembrete (enviada X dias antes)
    const reminderMessage = await prisma.message.create({
      data: {
        content,
        type: MessageType.TEXT,
        status: MessageStatus.SCHEDULED,
        scheduledAt: reminderDate,
        reminderDays,
        reminderSent: false,
        isReminder: true,
        userId,
        contactId,
      },
      include: {
        contact: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
          },
        },
      },
    })

    res.status(201).json(reminderMessage)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar lembrete' })
  }
}
