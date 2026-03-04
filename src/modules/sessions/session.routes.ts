import { Router } from 'express';
import { sessionController } from './session.controller.js';
import { authenticate } from '../../middleware/auth.js';

export const sessionRoutes = Router();

sessionRoutes.use(authenticate);

sessionRoutes.get('/', sessionController.get);
sessionRoutes.post('/start', sessionController.start);
sessionRoutes.get('/status', sessionController.getStatus);
sessionRoutes.get('/qr', sessionController.getQr);
sessionRoutes.post('/stop', sessionController.stop);
sessionRoutes.post('/logout', sessionController.logout);
