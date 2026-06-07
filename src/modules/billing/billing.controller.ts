import { Response } from 'express'
import { billingService } from './billing.service.ts'
import { asyncHandler } from '../../shared/utils/asyncHandler.ts'
import { AppError } from '../../shared/errors/AppError.ts'
import type { AuthRequest } from '../auth/auth.types.ts'
import { billingRepository } from './billing.repository.ts'
import { env } from '../../config/env.ts'

const getUserId = (req: AuthRequest): string => {
  if (!req.user?.id) {
    throw new AppError('Usuário não autenticado', 401)
  }
  return req.user.id
}

export const billingController = {
  listPlans: asyncHandler(async (_req: AuthRequest, res: Response) => {
    res.json(billingService.plans)
  }),

  getSubscription: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const sub = await billingService.getSubscription(userId)
    const effective = billingService.computeEffectivePlan(sub)
    res.json({ subscription: sub, effective })
  }),

  checkoutCard: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const { plan } = req.body as { plan?: 'starter' | 'pro' }

    if (plan !== 'starter' && plan !== 'pro') {
      throw new AppError('Plano inválido', 400)
    }

    const backUrl = `${env.MP_FRONTEND_URL}/dashboard/planos?status=success`

    const result = await billingService.checkoutCard(userId, plan, backUrl)
    res.status(201).json(result)
  }),

  checkoutPix: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const { plan } = req.body as { plan?: 'starter' | 'pro' }

    if (plan !== 'starter' && plan !== 'pro') {
      throw new AppError('Plano inválido', 400)
    }

    const result = await billingService.checkoutPix(userId, plan)
    res.status(201).json(result)
  }),

  renewPix: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const result = await billingService.renewPix(userId)
    res.status(201).json(result)
  }),

  cancel: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    await billingService.cancel(userId)
    res.json({ success: true })
  }),

  // endpoint administrativo para o worker usar; mantemos atrás de auth por enquanto
  expireOverdue: asyncHandler(async (req: AuthRequest, res: Response) => {
    const count = await billingService.expireOverduePix()
    res.json({ expired: count })
  }),
}
