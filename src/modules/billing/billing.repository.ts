import { supabase } from '../../config/supabase.ts'
import type {
  Subscription,
  PlanTier,
  SubStatus,
  PaymentMethod,
} from './billing.types.ts'

export const billingRepository = {
  async findByUser(userId: string): Promise<Subscription | null> {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.error('[BillingRepository] findByUser error:', error.message)
      return null
    }
    return data as Subscription | null
  },

  async upsertForUser(
    userId: string,
    data: Partial<Subscription>,
  ): Promise<Subscription | null> {
    const { data: row, error } = await supabase
      .from('subscriptions')
      .upsert(
        { user_id: userId, ...data, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
      .select()
      .maybeSingle()

    if (error) {
      console.error('[BillingRepository] upsertForUser error:', error.message)
      return null
    }
    return row as Subscription | null
  },

  async updatePlan(
    userId: string,
    plan: PlanTier,
    patch: Partial<Subscription> = {},
  ): Promise<Subscription | null> {
    const { data, error } = await supabase
      .from('subscriptions')
      .update({
        plan,
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select()
      .maybeSingle()

    if (error) {
      console.error('[BillingRepository] updatePlan error:', error.message)
      return null
    }
    return data as Subscription | null
  },

  async setStatus(
    userId: string,
    status: SubStatus,
    patch: Partial<Subscription> = {},
  ): Promise<Subscription | null> {
    const { data, error } = await supabase
      .from('subscriptions')
      .update({
        status,
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select()
      .maybeSingle()

    if (error) {
      console.error('[BillingRepository] setStatus error:', error.message)
      return null
    }
    return data as Subscription | null
  },

  async setAdmin(
    userId: string,
    isAdmin: boolean,
  ): Promise<Subscription | null> {
    const { data, error } = await supabase
      .from('subscriptions')
      .update({
        is_admin: isAdmin,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .select()
      .maybeSingle()

    if (error) {
      console.error('[BillingRepository] setAdmin error:', error.message)
      return null
    }
    return data as Subscription | null
  },

  async findPixExpiringSoon(
    daysAhead = 3,
  ): Promise<Subscription[]> {
    const limit = new Date()
    limit.setDate(limit.getDate() + daysAhead)

    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('plan', 'pro')
      .eq('payment_method', 'pix')
      .in('status', ['active', 'past_due'])
      .not('current_period_end', 'is', null)
      .lte('current_period_end', limit.toISOString())
      .gte('current_period_end', new Date().toISOString())
      .is('last_payment_id', null)

    if (error) {
      console.error('[BillingRepository] findPixExpiringSoon error:', error.message)
      return []
    }
    return (data || []) as Subscription[]
  },

  async findExpiredPix(): Promise<Subscription[]> {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('payment_method', 'pix')
      .in('status', ['active', 'past_due'])
      .not('current_period_end', 'is', null)
      .lt('current_period_end', new Date().toISOString())

    if (error) {
      console.error('[BillingRepository] findExpiredPix error:', error.message)
      return []
    }
    return (data || []) as Subscription[]
  },

  async recordWebhookEvent(
    id: string,
    type: string,
    payload: unknown,
  ): Promise<boolean> {
    const { error } = await supabase
      .from('mp_webhook_events')
      .insert({ id, type, payload })

    if (error && error.code !== '23505') {
      console.error('[BillingRepository] recordWebhookEvent error:', error.message)
      return false
    }
    return !error
  },

  async hasWebhookEvent(id: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('mp_webhook_events')
      .select('id')
      .eq('id', id)
      .maybeSingle()

    if (error) return false
    return !!data
  },
}

export type { PlanTier, SubStatus, PaymentMethod }
