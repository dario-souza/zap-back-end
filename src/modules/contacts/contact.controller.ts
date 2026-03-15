import { Response } from 'express'
import { contactService } from './contact.service.ts'
import { asyncHandler } from '../../shared/utils/asyncHandler.ts'
import type { AuthRequest } from '../auth/auth.types.ts'
import type { CreateContactDto, UpdateContactDto } from './contact.types.ts'

const getUserId = (req: AuthRequest): string => {
  if (!req.user?.id) {
    throw new Error('Usuário não autenticado')
  }
  return req.user.id
}

export const contactController = {
  getAll: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const contacts = await contactService.getAll(userId)
    res.json(contacts)
  }),

  getById: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const { id } = req.params
    const contact = await contactService.getById(id, userId)

    if (!contact) {
      res.status(404).json({ error: 'Contato não encontrado' })
      return
    }

    res.json(contact)
  }),

  create: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const input: CreateContactDto = req.body
    const contact = await contactService.create(userId, input)
    res.status(201).json(contact)
  }),

  update: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const { id } = req.params
    const input: UpdateContactDto = req.body
    const contact = await contactService.update(id, userId, input)
    res.json(contact)
  }),

  delete: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const { id } = req.params
    await contactService.delete(id, userId)
    res.status(204).send()
  }),

  deleteAll: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    await contactService.deleteAll(userId)
    res.status(204).send()
  }),

  importCSV: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const { csvContent } = req.body

    if (!csvContent) {
      res.status(400).json({ error: 'Conteúdo CSV é obrigatório' })
      return
    }

    const result = await contactService.importCSV(userId, csvContent)
    res.json(result)
  }),

  exportCSV: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const csv = await contactService.exportCSV(userId)

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', 'attachment; filename=contatos.csv')
    res.send(csv)
  }),
}
