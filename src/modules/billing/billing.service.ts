import { billingRepository } from './billing.repository.ts'
import { mercadopago } from './mercadopago.ts'
import { supabase } from '../../config/supabase.ts'
import { env } from '../../config/env.ts'
import { AppError } from '../../shared/errors/AppError.ts'
import { PLANS } from './billing.types.ts'
import type {
  PlanTier,
  Subscription,
  PaymentMethod,
} from './billing.types.ts'

const PLAN_TO_MP_ID: Record<'starter' | 'pro', string> = {
  starter: env.MP_PLAN_STARTER_ID,
  pro: env.MP_PLAN_PRO_ID,
}

const PLAN_TO_AMOUNT: Record<'starter' | 'pro', number> = {
  starter: 39.9,
  pro: 79.9,
}

const addDays = (base: Date, days: number): Date => {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d
}

const getUserEmail = async (userId: string): Promise<string> => {
  const { data, error } = await supabase.auth.admin.getUserById(userId)
  if (error || !data?.user?.email) {
    throw new AppError('Não foi possível obter o e-mail do usuário', 500)
  }
  return data.user.email
}

export const billingService = {
  plans: PLANS,

  async getSubscription(userId: string): Promise<Subscription | null> {
    return billingRepository.findByUser(userId)
  },

  async checkoutCard(
    userId: string,
    plan: 'starter' | 'pro',
    backUrl: string,
  ): Promise<{ init_point: string; preapproval_id: string }> {
    const preapprovalPlanId = PLAN_TO_MP_ID[plan]
    if (!preapprovalPlanId) {
      throw new AppError(`Plano MP não configurado para ${plan}`, 500)
    }

    const email = await getUserEmail(userId)

    const { id, init_point } = await mercadopago.createCardSubscription({
      preapprovalPlanId,
      payerEmail: email,
      userId,
      backUrl,
    })

    await billingRepository.upsertForUser(userId, {
      plan,
      status: 'trialing',
      payment_method: 'credit_card',
      mp_preapproval_id: id,
      mp_payer_id: null,
      started_at: new Date().toISOString(),
    })

    return { init_point, preapproval_id: id }
  },

  async checkoutPix(
    userId: string,
    plan: 'starter' | 'pro',
  ): Promise<{
    payment_id: string
    qr_base64: string
    qr_copy: string
    expires_at: string
  }> {
    const amount = PLAN_TO_AMOUNT[plan]
    if (!amount) {
      throw new AppError(`Plano inválido: ${plan}`, 400)
    }

    const email = await getUserEmail(userId)

    const pix = await mercadopago.createPixPayment({
      amount,
      description: `Assinatura ZapReminder ${plan.toUpperCase()}`,
      payerEmail: email,
      userId,
    })

    await billingRepository.upsertForUser(userId, {
      plan,
      status: 'past_due',
      payment_method: 'pix',
      last_payment_id: pix.id,
      last_payment_qr_base64: pix.qr_base64,
      last_payment_qr_copy: pix.qr_copy,
      last_payment_expires_at: pix.expires_at,
      started_at: new Date().toISOString(),
    })

    return {
      payment_id: pix.id,
      qr_base64: pix.qr_base64,
      qr_copy: pix.qr_copy,
      expires_at: pix.expires_at,
    }
  },

  async renewPix(userId: string): Promise<{
    payment_id: string
    qr_base64: string
    qr_copy: string
    expires_at: string
  }> {
    const sub = await billingRepository.findByUser(userId)
    if (!sub) {
      throw new AppError('Assinatura não encontrada', 404)
    }
    if (sub.payment_method !== 'pix' || !sub.plan || sub.plan === 'free') {
      throw new AppError('Renovação PIX só disponível para planos pagos via PIX', 400)
    }

    const plan = sub.plan as 'starter' | 'pro'
    return this.checkoutPix(userId, plan)
  },

  async cancel(userId: string): Promise<void> {
    const sub = await billingRepository.findByUser(userId)
    if (!sub) {
      throw new AppError('Assinatura não encontrada', 404)
    }

    if (sub.payment_method === 'credit_card' && sub.mp_preapproval_id) {
      try {
        await mercadopago.cancelPreapproval(sub.mp_preapproval_id)
      } catch (err) {
        console.warn('[BillingService] cancelPreapproval falhou:', err)
      }
    }

    await billingRepository.updatePlan(userId, sub.plan, {
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
    })
  },

  async onPreapprovalAuthorized(preapprovalId: string): Promise<void> {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('mp_preapproval_id', preapprovalId)
      .maybeSingle()

    if (error || !data) {
      console.warn('[BillingService] preapproval não encontrado:', preapprovalId)
      return
    }

    const sub = data as Subscription
    const periodEnd = addDays(new Date(), 30).toISOString()

    await billingRepository.updatePlan(sub.user_id, sub.plan, {
      status: 'active',
      payment_method: 'credit_card',
      current_period_end: periodEnd,
      cancelled_at: null,
    })
  },

  async onPreapprovalCancelled(preapprovalId: string): Promise<void> {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('mp_preapproval_id', preapprovalId)
      .maybeSingle()

    if (error || !data) return

    const sub = data as Subscription
    await billingRepository.setStatus(sub.user_id, 'cancelled', {
      cancelled_at: new Date().toISOString(),
    })
  },

  async onPaymentApproved(paymentId: string): Promise<void> {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('last_payment_id', String(paymentId))
      .maybeSingle()

    if (error || !data) {
      console.warn('[BillingService] pagamento não encontrado:', paymentId)
      return
    }

    const sub = data as Subscription
    const periodEnd = addDays(new Date(), 30).toISOString()

    await billingRepository.updatePlan(sub.user_id, sub.plan, {
      status: 'active',
      payment_method: 'pix',
      current_period_end: periodEnd,
      last_payment_qr_base64: null,
      last_payment_qr_copy: null,
      last_payment_expires_at: null,
    })
  },

  async expireOverduePix(): Promise<number> {
    const expired = await billingRepository.findExpiredPix()
    for (const sub of expired) {
      await billingRepository.setStatus(sub.user_id, 'expired', {
        last_payment_qr_base64: null,
        last_payment_qr_copy: null,
        last_payment_expires_at: null,
      })
    }
    return expired.length
  },

  computeEffectivePlan(sub: Subscription | null): {
    plan: PlanTier
    status: 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired' | 'blocked'
    isTrialing: boolean
    isBlocked: boolean
    isAdmin: boolean
  } {
    if (!sub) {
      return {
        plan: 'free',
        status: 'blocked',
        isTrialing: false,
        isBlocked: true,
        isAdmin: false,
      }
    }

    if (sub.is_admin) {
      return {
        plan: 'pro',
        status: 'active',
        isTrialing: false,
        isBlocked: false,
        isAdmin: true,
      }
    }

    const now = new Date()
    const trialExpired =
      sub.status === 'trialing' &&
      sub.trial_ends_at &&
      new Date(sub.trial_ends_at) < now

    if (sub.status === 'cancelled' || sub.status === 'expired' || trialExpired) {
      return {
        plan: 'free',
        status: trialExpired ? 'expired' : sub.status,
        isTrialing: false,
        isBlocked: true,
        isAdmin: false,
      }
    }

    if (sub.status === 'past_due') {
      return {
        plan: sub.plan,
        status: 'past_due',
        isTrialing: false,
        isBlocked: false,
        isAdmin: false,
      }
    }

    return {
      plan: sub.plan,
      status: sub.status,
      isTrialing: sub.status === 'trialing',
      isBlocked: false,
      isAdmin: false,
    }
  },
}
