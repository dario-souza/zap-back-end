import { Router } from 'express';
import { ContactController } from './contact.controller.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();
const controller = new ContactController();

router.use(authenticate);

router.get('/', controller.getAll.bind(controller));
router.get('/:id', controller.getById.bind(controller));
router.post('/', controller.create.bind(controller));
router.put('/:id', controller.update.bind(controller));
router.delete('/:id', controller.delete.bind(controller));
router.delete('/', controller.deleteAll.bind(controller));

export default router;
