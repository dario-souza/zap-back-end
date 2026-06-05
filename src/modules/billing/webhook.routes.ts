import { Router, Request, Response } from 'express'
import { billingService } from './billing.service.ts'
import { billingRepository } from './billing.repository.ts'
import { asyncHandler } from '../../shared/utils/asyncHandler.ts'

const router = Router()

/**
 * Webhook do Mercado Pago.
 * - Sem auth (validação feita por payload + idempotência via mp_webhook_events)
 * - Responde 200 sempre que o evento for conhecido ou duplicado, para evitar retentativas.
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body || {}
    const eventId = String(
      body?.data?.id || body?.id || `${Date.now()}-${Math.random()}`,
    )
    const eventType: string = body?.type || body?.action || 'unknown'

    const stored = await billingRepository.recordWebhookEvent(eventId, eventType, body)
    if (!stored) {
      // já processado (id duplicado)
      res.json({ ok: true, duplicate: true })
      return
    }

    try {
      switch (eventType) {
        case 'subscription_preapproval':
        case 'preapproval': {
          const preapprovalId = String(body?.data?.id || body?.id)
          const status = body?.action || body?.data?.status
          if (status === 'authorized' || status === 'created') {
            await billingService.onPreapprovalAuthorized(preapprovalId)
          } else if (
            status === 'cancelled' ||
            status === 'paused' ||
            status === 'disabled'
          ) {
            await billingService.onPreapprovalCancelled(preapprovalId)
          }
          break
        }
        case 'subscription_authorized_payment': {
          // Renovação recorrente via cartão: apenas estende o período atual
          const subId = body?.data?.id
          if (subId) {
            const { data } = await import('../../config/supabase.ts').then((m) =>
              m.supabase
                .from('subscriptions')
                .select('*')
                .eq('mp_preapproval_id', String(subId))
                .maybeSingle(),
            )
            if (data) {
              const periodEnd = new Date()
              periodEnd.setDate(periodEnd.getDate() + 30)
              await billingRepository.updatePlan(data.user_id, data.plan, {
                status: 'active',
                current_period_end: periodEnd.toISOString(),
                cancelled_at: null,
              })
            }
          }
          break
        }
        case 'payment':
        case 'payments': {
          const paymentId = String(body?.data?.id || body?.id)
          if (paymentId) {
            const status =
              body?.action ||
              body?.data?.status ||
              body?.status ||
              'unknown'
            if (status === 'approved' || status === 'payment.approved') {
              await billingService.onPaymentApproved(paymentId)
            }
          }
          break
        }
        default:
          console.log('[MP Webhook] evento ignorado:', eventType)
      }
    } catch (err) {
      console.error('[MP Webhook] erro ao processar evento:', err)
    }

    res.json({ ok: true })
  }),
)

export { router as billingWebhookRoutes }
