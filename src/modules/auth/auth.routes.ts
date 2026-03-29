import { Router } from 'express'
import { authController } from './auth.controller.ts'

export const authRoutes = Router()

authRoutes.post('/login', authController.login)
authRoutes.post('/register', authController.register)
authRoutes.get('/me', authController.me)
