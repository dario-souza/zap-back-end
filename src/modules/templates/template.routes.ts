import { Router } from 'express';
import { templateController } from './template.controller.ts';
import { authenticate } from '../../middleware/auth.ts';

export const templateRoutes = Router();

templateRoutes.use(authenticate);

templateRoutes.get('/', templateController.getAll);
templateRoutes.post('/', templateController.create);
templateRoutes.put('/:id', templateController.update);
templateRoutes.delete('/:id', templateController.delete);
templateRoutes.delete('/', templateController.deleteAll);
