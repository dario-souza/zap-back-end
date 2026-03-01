import { Router } from 'express';
import { MessageController } from './message.controller.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();
const controller = new MessageController();

router.use(authenticate);

router.get('/', controller.getAll.bind(controller));
router.get('/:id', controller.getById.bind(controller));
router.post('/', controller.create.bind(controller));
router.put('/:id', controller.update.bind(controller));
router.delete('/:id', controller.delete.bind(controller));
router.delete('/', controller.deleteAll.bind(controller));
router.post('/:id/send', controller.sendNow.bind(controller));

export default router;
