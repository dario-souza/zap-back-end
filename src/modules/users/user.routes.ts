import { Router } from 'express';
import { userController } from './user.controller.ts';
import { authenticate } from '../../middleware/auth.ts';

export const userRoutes = Router();

userRoutes.use(authenticate);

userRoutes.get('/profile', userController.getProfile);
userRoutes.put('/profile', userController.updateProfile);
