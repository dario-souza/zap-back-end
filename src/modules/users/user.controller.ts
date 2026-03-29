import { Response } from 'express'
import { userService } from './user.service.ts'
import { asyncHandler } from '../../shared/utils/asyncHandler.ts'
import { AppError } from '../../shared/errors/AppError.ts'
import type { AuthRequest } from '../auth/auth.types.ts'

const getUserId = (req: AuthRequest): string => {
  if (!req.user?.id) {
    throw new AppError('Usuário não autenticado', 401)
  }
  return req.user.id
}

export const userController = {
  getProfile: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const profile = await userService.getProfile(userId)

    if (!profile) {
      throw new AppError('Perfil não encontrado', 404)
    }

    res.json(profile)
  }),

  updateProfile: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    const { name } = req.body

    const profile = await userService.updateProfile(userId, { name })
    res.json(profile)
  }),

  deleteAccount: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = getUserId(req)
    await userService.deleteAccount(userId)
    res.status(200).json({ message: 'Conta deletada com sucesso' })
  }),
}
