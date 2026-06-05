import { Request, Response, NextFunction, RequestHandler } from 'express'
import { billingService } from './billing.service.ts'
import { asyncHandler } from '../../shared/utils/asyncHandler.ts'
import type { AuthRequest } from '../auth/auth.types.ts'
import type { PlanTier } from './billing.types.ts'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      subscription?: {
        plan: PlanTier
        isTrialing: boolean
        isBlocked: boolean
        isAdmin: boolean
      }
    }
  }
}

const FREE_PLANS: PlanTier[] = ['free']

/**
 * Resolve o plano efetivo do usuário (trial expirado, cancelado, etc.) e
 * injeta em req.subscription. Não bloqueia — só calcula.
 */
export const loadSubscription = asyncHandler(
  async (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user?.id) {
      next()
      return
    }

    const sub = await billingService.getSubscription(req.user.id)
    const effective = billingService.computeEffectivePlan(sub)

    ;(req as AuthRequest & { subscription?: unknown }).subscription = {
      plan: effective.plan,
      isTrialing: effective.isTrialing,
      isBlocked: effective.isBlocked,
      isAdmin: effective.isAdmin,
    }

    next()
  },
)

/**
 * Gate de plano: bloqueia requisições cujo plano efetivo não está em `allowed`.
 * Deve ser usado DEPOIS de `loadSubscription`.
 */
export const requirePlan =
  (allowed: PlanTier[]): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    const sub = (req as AuthRequest).subscription

    if (!sub) {
      res.status(401).json({ error: 'Assinatura não carregada' })
      return
    }

    if (sub.isAdmin) {
      next()
      return
    }

    if (!allowed.includes(sub.plan)) {
      res.status(403).json({
        error: 'Faça upgrade para acessar este recurso',
        code: 'UPGRADE_REQUIRED',
        currentPlan: sub.plan,
      })
      return
    }

    next()
  }

/**
 * Atalho para endpoints que exigem plano pago (qualquer um).
 */
export const requirePaid = requirePlan(['starter', 'pro'])

/**
 * Bloqueia usuários cujo trial expirou ou assinatura está inativa.
 * Admins sempre passam.
 */
export const requireActive: RequestHandler = (req, res, next) => {
  const sub = (req as AuthRequest).subscription

  if (!sub) {
    res.status(401).json({ error: 'Não autenticado' })
    return
  }

  if (sub.isAdmin) {
    next()
    return
  }

  if (sub.isBlocked) {
    res.status(402).json({
      error: 'Assinatura inativa. Renove para continuar.',
      code: 'SUBSCRIPTION_BLOCKED',
    })
    return
  }

  next()
}

/**
 * Permite acesso a um recurso se:
 * - o usuário é admin, OU
 * - o usuário tem o plano alvo (ex.: 'pro'), OU
 * - o usuário está no trial FREE (acesso completo durante 7 dias).
 *
 * Bloqueia: STARTER, FREE pós-trial, FREE bloqueado.
 */
export const requirePlanOrTrial =
  (targetPlan: PlanTier): RequestHandler =>
  (req, res, next) => {
    const sub = (req as AuthRequest).subscription

    if (!sub) {
      res.status(401).json({ error: 'Não autenticado' })
      return
    }

    if (sub.isAdmin) {
      next()
      return
    }

    if (sub.isBlocked) {
      res.status(402).json({
        error: 'Assinatura inativa. Assine um plano para continuar.',
        code: 'SUBSCRIPTION_BLOCKED',
      })
      return
    }

    if (sub.plan === targetPlan) {
      next()
      return
    }

    if (sub.isTrialing) {
      next()
      return
    }

    res.status(403).json({
      error: `Faça upgrade para o plano ${targetPlan.toUpperCase()} para acessar este recurso`,
      code: 'UPGRADE_REQUIRED',
      currentPlan: sub.plan,
    })
  }

export { FREE_PLANS }
