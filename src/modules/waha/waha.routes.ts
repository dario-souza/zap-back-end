import { Router } from 'express';
import { WahaController } from './waha.controller.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();
const controller = new WahaController();

router.use(authenticate);

router.get('/session/status', controller.getStatus);
router.get('/session/qr', controller.getQRCode);
router.post('/session/start', controller.startSession);
router.post('/session/disconnect', controller.disconnect);
router.post('/session/restart', controller.restartSession);

export default router;
