import { Router } from 'express'
import { sessionController } from './session.controller'
import { authMiddleware } from '../auth/auth.middleware'

export const sessionRoutes = Router()

sessionRoutes.get('/stream', sessionController.stream as any)

sessionRoutes.use(authMiddleware)

sessionRoutes.get('/', sessionController.get)
sessionRoutes.post('/start', sessionController.start)
sessionRoutes.get('/status', sessionController.getStatus)
sessionRoutes.get('/qr', sessionController.getQr)
sessionRoutes.post('/stop', sessionController.stop)
sessionRoutes.post('/logout', sessionController.logout)
