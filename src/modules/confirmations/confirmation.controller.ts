import { Response } from 'express'
import { confirmationService } from './confirmation.service.ts'
import { asyncHandler } from '../../shared/utils/asyncHandler.ts'
import type { AuthRequest } from '../auth/auth.types.ts'

const getUserId = (req: AuthRequest): string => {
  if (!req.user?.id) {
    throw new Error('Usuário não autenticado')
  }
  return req.user.id
}

export const confirmationController = {
  getAll: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const confirmations = await confirmationService.getAll(userId)
    res.json(confirmations)
  }),

  getById: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const { id } = req.params
    const confirmation = await confirmationService.getById(id, userId)

    if (!confirmation) {
      res.status(404).json({ error: 'Confirmação não encontrada' })
      return
    }

    res.json(confirmation)
  }),

  create: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const { contactName, contactPhone, eventDate, sendAt, messageContent, contactId, confirmationResponseMessage, cancellationResponseMessage } = req.body

    if (!contactName || !contactPhone || !eventDate) {
      res.status(400).json({
        error: 'Nome do contato, telefone e data do evento são obrigatórios',
      })
      return
    }

    const confirmation = await confirmationService.create(
      userId,
      contactName,
      contactPhone,
      eventDate,
      sendAt,
      messageContent,
      contactId,
      confirmationResponseMessage,
      cancellationResponseMessage,
    )
    res.status(201).json(confirmation)
  }),

  update: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const { id } = req.params
    const { status, response } = req.body

    if (!status || !['CONFIRMED', 'DENIED'].includes(status)) {
      res.status(400).json({ error: 'Status inválido' })
      return
    }

    const confirmation = await confirmationService.update(
      id,
      userId,
      status,
      response,
    )
    res.json(confirmation)
  }),

  sendNow: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const { id } = req.params
    await confirmationService.sendNow(id, userId)
    res.status(204).send()
  }),

  delete: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const { id } = req.params
    await confirmationService.delete(id, userId)
    res.status(204).send()
  }),

  deleteAll: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const count = await confirmationService.deleteAll(userId)
    res.json({ deleted: count })
  }),
}
