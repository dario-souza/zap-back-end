import { Router } from 'express';
import { TemplateController } from './template.controller.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();
const controller = new TemplateController();

router.use(authenticate);

router.get('/', controller.getAll);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);
router.delete('/', controller.deleteAll);

export default router;
