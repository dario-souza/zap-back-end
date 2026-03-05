import { Router } from 'express';
import { confirmationController } from './confirmation.controller.ts';
import { authenticate } from '../../middleware/auth.ts';

export const confirmationRoutes = Router();

confirmationRoutes.use(authenticate);

confirmationRoutes.get('/', confirmationController.getAll);
confirmationRoutes.get('/:id', confirmationController.getById);
confirmationRoutes.post('/', confirmationController.create);
confirmationRoutes.put('/:id', confirmationController.update);
confirmationRoutes.delete('/:id', confirmationController.delete);
