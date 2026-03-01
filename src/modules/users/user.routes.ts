import { Router } from 'express';
import { UserController } from './user.controller.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();
const controller = new UserController();

router.get('/profile', authenticate, controller.getProfile.bind(controller));
router.put('/profile', authenticate, controller.updateProfile.bind(controller));

export default router;
