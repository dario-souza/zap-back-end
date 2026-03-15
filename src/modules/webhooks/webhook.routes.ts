import { Router } from 'express'
import { webhookController } from './webhook.controller.ts'

const router = Router()

router.post('/waha', webhookController.receive)

export { router as webhookRoutes }
