import { Router } from 'express'
import { contactController } from './contact.controller.ts'
import { authMiddleware } from '../auth/auth.middleware.ts'

export const contactRoutes = Router()

contactRoutes.use(authMiddleware)

contactRoutes.get('/', contactController.getAll)
contactRoutes.get('/:id', contactController.getById)
contactRoutes.post('/', contactController.create)
contactRoutes.post('/import', contactController.importCSV)
contactRoutes.get('/export', contactController.exportCSV)
contactRoutes.put('/:id', contactController.update)
contactRoutes.delete('/:id', contactController.delete)
contactRoutes.delete('/', contactController.deleteAll)
