import type { Request, Response } from 'express'
import { prisma } from '../lib/prisma.ts'
import { MessageType, MessageStatus } from '@prisma/client'

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

    const updatedMessage = await prisma.message.update({
      where: { id },
      data: {
        status: MessageStatus.SENT,
        sentAt: new Date(),
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
    })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao enviar mensagem' })
  }
}
