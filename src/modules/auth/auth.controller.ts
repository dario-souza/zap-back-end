import { Response } from 'express'
import { authService } from './auth.service.ts'
import { asyncHandler } from '../../shared/utils/asyncHandler.ts'
import type { AuthRequest } from './auth.types.ts'

export const authController = {
  login: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { email, password } = req.body

    if (!email || !password) {
      res.status(400).json({ error: 'Email e senha são obrigatórios' })
      return
    }

    const { user, session } = await authService.login(email, password)

    res.json({ user, session })
  }),

  register: asyncHandler(async (req: AuthRequest, res: Response) => {
    const { email, password, name } = req.body

    if (!email || !password) {
      res.status(400).json({ error: 'Email e senha são obrigatórios' })
      return
    }

    const { user, session } = await authService.register(email, password, name)

    res.json({ user, session })
  }),

  me: asyncHandler(async (req: AuthRequest, res: Response) => {
    const authReq = req as AuthRequest
    const token = authReq.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      res.status(401).json({ error: 'Token não fornecido' })
      return
    }

    const user = await authService.getUser(token)
    res.json({ user })
  }),
}
