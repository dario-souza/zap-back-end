import { Router } from 'express'
import { userController } from './user.controller.ts'
import { authMiddleware } from '../auth/auth.middleware.ts'

export const userRoutes = Router()

userRoutes.use(authMiddleware)

userRoutes.get('/profile', userController.getProfile)
userRoutes.put('/profile', userController.updateProfile)
userRoutes.delete('/account', userController.deleteAccount)
