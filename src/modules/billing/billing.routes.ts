import { Router } from 'express'
import { billingController } from './billing.controller.ts'
import { authMiddleware } from '../auth/auth.middleware.ts'

export const billingRoutes = Router()

billingRoutes.use(authMiddleware)

billingRoutes.get('/plans', billingController.listPlans)
billingRoutes.get('/subscription', billingController.getSubscription)
billingRoutes.post('/checkout/card', billingController.checkoutCard)
billingRoutes.post('/checkout/pix', billingController.checkoutPix)
billingRoutes.post('/renew/pix', billingController.renewPix)
billingRoutes.post('/cancel', billingController.cancel)
billingRoutes.post('/expire-overdue', billingController.expireOverdue)
