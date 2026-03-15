import { Response, NextFunction } from 'express'
import { supabase } from '../../config/supabase.ts'
import type { AuthRequest } from './auth.types.ts'

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token não fornecido' })
    return
  }

  const token = authHeader.split(' ')[1]

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)

  if (error || !user) {
    res.status(401).json({ error: 'Token inválido ou expirado' })
    return
  }

  req.user = {
    id: user.id,
    email: user.email || '',
  }

  next()
}
