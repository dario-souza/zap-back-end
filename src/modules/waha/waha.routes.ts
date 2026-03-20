import { Router } from 'express';
import { wahaController } from './waha.controller.ts';
import { authMiddleware } from '../auth/auth.middleware.ts';

const router = Router();

router.use(authMiddleware);

router.get('/session/status', wahaController.getStatus);
router.get('/session/qr', wahaController.getQRCode);
router.post('/session/start', wahaController.startSession);
router.post('/session/disconnect', wahaController.disconnect);

export { router as wahaRoutes };
