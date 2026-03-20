import { Router, Request, Response } from 'express'
import { supabase } from '../../config/supabase.ts'
import { asyncHandler } from '../../shared/utils/asyncHandler.ts'
import type { AuthRequest } from './auth.types.ts'

export const authRoutes = Router()

const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body

  if (!email || !password) {
    res.status(400).json({ error: 'Email e senha são obrigatórios' })
    return
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    res.status(401).json({ error: error.message })
    return
  }

  res.json({
    user: data.user,
    session: data.session,
  })
})

const register = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, name } = req.body

  if (!email || !password) {
    res.status(400).json({ error: 'Email e senha são obrigatórios' })
    return
  }

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
    res.status(400).json({ error: error.message })
    return
  }

  res.json({
    user: data.user,
    session: data.session,
  })
})

const me = asyncHandler(async (req: AuthRequest, res: Response) => {
  const authReq = req as AuthRequest
  const token = authReq.headers.authorization?.replace('Bearer ', '')

  if (!token) {
    res.status(401).json({ error: 'Token não fornecido' })
    return
  }

  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    res.status(401).json({ error: 'Token inválido' })
    return
  }

  res.json({ user })
})

authRoutes.post('/login', login)
authRoutes.post('/register', register)
authRoutes.get('/me', me)
