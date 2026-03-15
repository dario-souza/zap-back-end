import { Router } from 'express'
import { confirmationController } from './confirmation.controller.ts'
import { authMiddleware } from '../auth/auth.middleware.ts'

export const confirmationRoutes = Router()

confirmationRoutes.use(authMiddleware)

confirmationRoutes.get('/', confirmationController.getAll)
confirmationRoutes.get('/:id', confirmationController.getById)
confirmationRoutes.post('/', confirmationController.create)
confirmationRoutes.put('/:id', confirmationController.update)
confirmationRoutes.delete('/:id', confirmationController.delete)
