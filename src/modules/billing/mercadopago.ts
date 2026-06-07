import { MercadoPagoConfig, PreApproval, Payment } from 'mercadopago'
import { env } from '../../config/env.ts'

const mpClient = new MercadoPagoConfig({
  accessToken: env.MP_ACCESS_TOKEN,
  options: { timeout: 15000 },
})

const preapproval = new PreApproval(mpClient)
const payment = new Payment(mpClient)

export interface CreatePreapprovalInput {
  amount: number
  payerEmail: string
  userId: string
  backUrl: string
}

export const mercadopago = {
  async createCardSubscription(input: CreatePreapprovalInput): Promise<{
    id: string
    init_point: string
  }> {
    // A SDK não tipa `notification_url` em preapprovals, mas a API do MP aceita.
    const result = await preapproval.create({
      body: {
        reason: 'Assinatura ZapReminder',
        external_reference: input.userId,
        payer_email: input.payerEmail,
        back_url: input.backUrl,
        notification_url: env.MP_WEBHOOK_URL,
        status: 'pending',
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: input.amount,
          currency_id: 'BRL',
        },
      } as any,
    })

    const id = String(result.id || '')
    const init_point = result.init_point || ''
    if (!id || !init_point) {
      throw new Error('MercadoPago não retornou init_point válido')
    }
    return { id, init_point }
  },

  async cancelPreapproval(preapprovalId: string): Promise<void> {
    await preapproval.update({
      id: preapprovalId,
      body: { status: 'cancelled' },
    })
  },

  async getPreapproval(preapprovalId: string): Promise<{
    status: string
    payer_id?: number
    next_payment_date?: string
  } | null> {
    try {
      const result = await preapproval.get({ id: preapprovalId })
      return {
        status: result.status || 'unknown',
        payer_id: result.payer_id,
        next_payment_date: result.next_payment_date,
      }
    } catch {
      return null
    }
  },

  async createPixPayment(input: {
    amount: number
    description: string
    payerEmail: string
    userId: string
  }): Promise<{
    id: string
    qr_base64: string
    qr_copy: string
    expires_at: string
  }> {
    const result = await payment.create({
      body: {
        transaction_amount: input.amount,
        description: input.description,
        payment_method_id: 'pix',
        payer: { email: input.payerEmail },
        external_reference: input.userId,
        notification_url: env.MP_WEBHOOK_URL,
        date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
    })

    const id = String(result.id || '')
    const tx = result.point_of_interaction?.transaction_data
    const qr_base64 = tx?.qr_code_base64 || ''
    const qr_copy = tx?.qr_code || ''

    if (!id || !qr_base64 || !qr_copy) {
      throw new Error('MercadoPago não retornou QR Code válido')
    }

    return {
      id,
      qr_base64,
      qr_copy,
      expires_at:
        result.date_of_expiration || new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }
  },

  async getPayment(paymentId: string): Promise<{
    id: string
    status: string
    status_detail?: string
  } | null> {
    try {
      const result = await payment.get({ id: paymentId })
      return {
        id: String(result.id || paymentId),
        status: result.status || 'unknown',
        status_detail: result.status_detail,
      }
    } catch {
      return null
    }
  },
}
