import { Response } from 'express'
import { templateService } from './template.service.ts'
import { asyncHandler } from '../../shared/utils/asyncHandler.ts'
import type { AuthRequest } from '../auth/auth.types.ts'

const getUserId = (req: AuthRequest): string => {
  if (!req.user?.id) {
    throw new Error('Usuário não autenticado')
  }
  return req.user.id
}

export const templateController = {
  getAll: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const templates = await templateService.getAll(userId)
    res.json(templates)
  }),

  create: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const { name, content } = req.body

    if (!name || !content) {
      res.status(400).json({ error: 'Nome e conteúdo são obrigatórios' })
      return
    }

    const template = await templateService.create(userId, name, content)
    res.status(201).json(template)
  }),

  update: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const { id } = req.params
    const { name, content } = req.body

    const template = await templateService.update(id, userId, name, content)
    res.json(template)
  }),

  delete: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const { id } = req.params
    await templateService.delete(userId, id)
    res.status(204).send()
  }),

  deleteAll: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    await templateService.deleteAll(userId)
    res.status(204).send()
  }),
}
