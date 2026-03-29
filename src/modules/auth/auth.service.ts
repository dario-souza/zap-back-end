import { supabase } from '../../config/supabase'
import { AppError } from '../../shared/errors/AppError.ts'
import type { User, Session } from '@supabase/supabase-js'

export const authService = {
  async login(email: string, password: string): Promise<{ user: User; session: Session }> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      throw new AppError(error.message, 401)
    }

    if (!data.user || !data.session) {
      throw new AppError('Falha ao fazer login', 500)
    }

    return { user: data.user, session: data.session }
  },

  async register(email: string, password: string, name?: string): Promise<{ user: User; session: Session | null }> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name || email.split('@')[0],
        },
      },
    })

    if (error) {
      throw new AppError(error.message, 400)
    }

    if (!data.user) {
      throw new AppError('Falha ao criar conta', 500)
    }

    return { user: data.user, session: data.session }
  },

  async getUser(token: string): Promise<User> {
    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      throw new AppError(error?.message || 'Token inválido', 401)
    }

    return user
  },
}
