import { Router } from 'express';
import { messageController } from './message.controller.ts';
import { authenticate } from '../../middleware/auth.ts';

export const messageRoutes = Router();

messageRoutes.use(authenticate);

messageRoutes.get('/', messageController.getAll);
messageRoutes.get('/:id', messageController.getById);
messageRoutes.post('/', messageController.create);
messageRoutes.post('/bulk', messageController.createBulk);
messageRoutes.post('/with-reminder', messageController.createWithReminder);
messageRoutes.post('/test', messageController.sendTest);
messageRoutes.put('/:id', messageController.update);
messageRoutes.delete('/:id', messageController.delete);
messageRoutes.delete('/', messageController.deleteAll);
messageRoutes.post('/:id/send', messageController.sendNow);
messageRoutes.post('/:id/cancel', messageController.cancel);
