import { Router } from 'express'
import { messageController } from './message.controller.ts'
import { authMiddleware } from '../auth/auth.middleware.ts'

export const messageRoutes = Router()

messageRoutes.use(authMiddleware)

messageRoutes.get('/', messageController.getAll)
messageRoutes.get('/history', messageController.getHistory)
messageRoutes.get('/history/count', messageController.getHistoryCount)
messageRoutes.delete('/history/clear', messageController.clearHistory)
messageRoutes.get('/stats/total-sent', messageController.getTotalSent)
messageRoutes.get('/stats/counts', messageController.getCountsByType)
messageRoutes.get('/:id', messageController.getById)
messageRoutes.post('/', messageController.create)
messageRoutes.post('/bulk', messageController.createBulk)
messageRoutes.post('/with-reminder', messageController.createWithReminder)
messageRoutes.post('/test', messageController.sendTest)
messageRoutes.put('/:id', messageController.update)
messageRoutes.delete('/', messageController.deleteAll)
messageRoutes.delete('/recurring/all', messageController.deleteAllRecurring)
messageRoutes.delete('/scheduled/all', messageController.deleteAllScheduled)
messageRoutes.post('/:id/send', messageController.sendNow)
messageRoutes.post('/:id/cancel', messageController.cancel)
messageRoutes.delete('/:id', messageController.delete)
