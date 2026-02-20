import type { Response } from 'express'
import { prisma } from '../lib/prisma.ts'
import type { AuthRequest } from '../middlewares/auth.ts'

export const getAllTemplates = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id

    const templates = await prisma.messageTemplate.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })

    res.json(templates)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar templates' })
  }
}

export const getTemplateById = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
    const { id } = req.params

    const template = await prisma.messageTemplate.findFirst({
      where: { id, userId },
    })

    if (!template) {
      res.status(404).json({ error: 'Template não encontrado' })
      return
    }

    res.json(template)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar template' })
  }
}

export const createTemplate = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
    const { name, content } = req.body

    const template = await prisma.messageTemplate.create({
      data: {
        name,
        content,
        userId,
      },
    })

    res.status(201).json(template)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar template' })
  }
}

export const updateTemplate = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
    const { id } = req.params
    const { name, content } = req.body

    const existingTemplate = await prisma.messageTemplate.findFirst({
      where: { id, userId },
    })

    if (!existingTemplate) {
      res.status(404).json({ error: 'Template não encontrado' })
      return
    }

    const template = await prisma.messageTemplate.update({
      where: { id },
      data: {
        name,
        content,
      },
    })

    res.json(template)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar template' })
  }
}

export const deleteTemplate = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
    const { id } = req.params

    const existingTemplate = await prisma.messageTemplate.findFirst({
      where: { id, userId },
    })

    if (!existingTemplate) {
      res.status(404).json({ error: 'Template não encontrado' })
      return
    }

    await prisma.messageTemplate.delete({
      where: { id },
    })

    res.json({ message: 'Template excluído com sucesso' })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir template' })
  }
}

export const deleteAllTemplates = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id

    const { count } = await prisma.messageTemplate.deleteMany({
      where: { userId },
    })

    res.json({ message: `${count} templates excluídos com sucesso` })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir templates' })
  }
}
