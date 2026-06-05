export type PlanTier = 'free' | 'starter' | 'pro'
export type SubStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'expired'
export type PaymentMethod = 'credit_card' | 'pix'

export interface Subscription {
  id: string
  user_id: string
  plan: PlanTier
  status: SubStatus
  payment_method: PaymentMethod | null
  mp_preapproval_id: string | null
  mp_payer_id: string | null
  current_period_end: string | null
  trial_ends_at: string
  started_at: string | null
  cancelled_at: string | null
  last_payment_id: string | null
  last_payment_qr_base64: string | null
  last_payment_qr_copy: string | null
  last_payment_expires_at: string | null
  is_admin: boolean
  created_at: string
  updated_at: string
}

export interface PlanDefinition {
  id: PlanTier
  name: string
  price: number
  features: string[]
  highlight?: boolean
}

export const PLANS: PlanDefinition[] = [
  {
    id: 'free',
    name: 'Teste Grátis',
    price: 0,
    features: [
      'Acesso completo por 7 dias',
      'Mensagens instantâneas',
      'Agendamento de mensagens',
      'Mensagens recorrentes',
      'Confirmações de presença',
    ],
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 39.9,
    features: [
      'Mensagens instantâneas',
      'Agendamento de mensagens',
      'Mensagens recorrentes',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 79.9,
    highlight: true,
    features: [
      'Mensagens instantâneas',
      'Agendamento de mensagens',
      'Mensagens recorrentes',
      'Confirmações de presença',
      'Suporte prioritário',
    ],
  },
]

export interface CheckoutCardResult {
  init_point: string
  preapproval_id: string
}

export interface CheckoutPixResult {
  payment_id: string
  qr_base64: string
  qr_copy: string
  expires_at: string
}

export interface MpWebhookPayload {
  type?: string
  action?: string
  data?: { id?: string }
  resource?: string
  user_id?: string
}
