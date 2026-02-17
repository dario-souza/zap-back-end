import type { Response } from 'express'
import { prisma } from '../lib/prisma.ts'
import type { AuthRequest } from '../middlewares/auth.ts'

export const getAllContacts = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id

    const contacts = await prisma.contact.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })

    res.json(contacts)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar contatos' })
  }
}

export const getContactById = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
    const { id } = req.params

    const contact = await prisma.contact.findFirst({
      where: { id, userId },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    })

    if (!contact) {
      res.status(404).json({ error: 'Contato não encontrado' })
      return
    }

    res.json(contact)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar contato' })
  }
}

export const createContact = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
    const { name, phone, email } = req.body

    const existingContact = await prisma.contact.findFirst({
      where: { phone, userId },
    })

    if (existingContact) {
      res.status(400).json({ error: 'Contato com este telefone já existe' })
      return
    }

    const contact = await prisma.contact.create({
      data: {
        name,
        phone,
        email,
        userId,
      },
    })

    res.status(201).json(contact)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar contato' })
  }
}

export const updateContact = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
    const { id } = req.params
    const { name, phone, email } = req.body

    const existingContact = await prisma.contact.findFirst({
      where: { id, userId },
    })

    if (!existingContact) {
      res.status(404).json({ error: 'Contato não encontrado' })
      return
    }

    const contact = await prisma.contact.update({
      where: { id },
      data: {
        name,
        phone,
        email,
      },
    })

    res.json(contact)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar contato' })
  }
}

export const deleteContact = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
    const { id } = req.params

    const existingContact = await prisma.contact.findFirst({
      where: { id, userId },
    })

    if (!existingContact) {
      res.status(404).json({ error: 'Contato não encontrado' })
      return
    }

    await prisma.contact.delete({
      where: { id },
    })

    res.json({ message: 'Contato excluído com sucesso' })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir contato' })
  }
}
