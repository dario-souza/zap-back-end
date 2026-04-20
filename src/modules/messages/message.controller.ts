import { Response } from 'express'
import { messageService } from './message.service'
import { messageHistoryRepository } from './message-history.repository'
import { asyncHandler } from '../../shared/utils/asyncHandler'
import { AppError } from '../../shared/errors/AppError'
import type { AuthRequest } from '../auth/auth.types'
import type { CreateMessageDto, UpdateMessageDto } from './message.types'

const getUserId = (req: AuthRequest): string => {
  if (!req.user?.id) {
    throw new AppError('Usuário não autenticado', 401)
  }
  return req.user.id
}

export const messageController = {
  getAll: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const messages = await messageService.getAll(userId)
    res.json(messages)
  }),

  getById: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const { id } = req.params
    const message = await messageService.getById(id, userId)

    if (!message) {
      res.status(404).json({ error: 'Mensagem não encontrada' })
      return
    }

    res.json(message)
  }),

  create: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const { chatId, body, contactId, templateId, scheduledAt, recurrenceType, recurrenceCron, recurrenceDayOfWeek, recurrenceDayOfMonth, recurrenceHour, recurrenceMinute, type } = req.body
    
    const input: CreateMessageDto = {
      phone: chatId?.replace('@c.us', '').replace('@g.us', '') || '',
      content: body || '',
      contact_id: contactId,
      type: type || 'instant',
      scheduled_at: scheduledAt,
      recurrence_type: recurrenceType || 'NONE',
      recurrence_cron: recurrenceCron,
      recurrence_day_of_week: recurrenceDayOfWeek,
      recurrence_day_of_month: recurrenceDayOfMonth,
      recurrence_hour: recurrenceHour,
      recurrence_minute: recurrenceMinute,
    }
    
    const message = await messageService.create(userId, input)
    res.status(201).json(message)
  }),

  update: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const { id } = req.params
    const input: UpdateMessageDto = req.body
    const message = await messageService.update(id, userId, input)
    res.json(message)
  }),

  delete: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const { id } = req.params
    await messageService.delete(id, userId)
    res.status(204).send()
  }),

  cancel: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const { id } = req.params
    const message = await messageService.cancel(id, userId)
    res.json(message)
  }),

  deleteAll: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    await messageService.deleteAll(userId)
    res.status(204).send()
  }),

  deleteAllRecurring: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const count = await messageService.deleteAllRecurring(userId)
    res.json({ deleted: count })
  }),

  deleteAllScheduled: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const count = await messageService.deleteAllScheduled(userId)
    res.json({ deleted: count })
  }),

  sendNow: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const { id } = req.params
    const message = await messageService.sendNow(id, userId)
    res.json(message)
  }),

  createBulk: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const { content, contactIds, scheduledAt, sendNow, recurrenceType } = req.body
    
    if (!content || !contactIds || !Array.isArray(contactIds)) {
      res.status(400).json({ error: 'Conteúdo e lista de contatos são obrigatórios' })
      return
    }

    const result = await messageService.createBulk(userId, content, contactIds, scheduledAt, sendNow, recurrenceType)
    res.status(201).json(result)
  }),

  createWithReminder: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const { content, contactId, scheduledAt, reminderDays } = req.body
    
    if (!content || !contactId || !scheduledAt || !reminderDays) {
      res.status(400).json({ error: 'Todos os campos são obrigatórios' })
      return
    }

    const message = await messageService.createWithReminder(userId, content, contactId, scheduledAt, reminderDays)
    res.status(201).json(message)
  }),

  sendTest: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const { phone, message } = req.body
    
    if (!phone || !message) {
      res.status(400).json({ error: 'Telefone e mensagem são obrigatórios' })
      return
    }

    const result = await messageService.sendTest(userId, phone, message)
    res.json(result)
  }),

  // History endpoints
  getHistory: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const { page = '1', limit = '20', type, search } = req.query

    const result = await messageHistoryRepository.findAll(userId, {
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
      type: type as string | undefined,
      search: search as string | undefined,
    })

    res.json(result)
  }),

  getHistoryCount: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const count = await messageHistoryRepository.getCount(userId)
    res.json({ count, limit: 500 })
  }),

  clearHistory: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    await messageHistoryRepository.clearAll(userId)
    res.status(204).send()
  }),

  getTotalSent: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const count = await messageHistoryRepository.getTotalSentCount(userId)
    res.json({ totalSent: count })
  }),

  getCountsByType: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const counts = await messageHistoryRepository.getCountsByType(userId)
    res.json(counts)
  }),
}
