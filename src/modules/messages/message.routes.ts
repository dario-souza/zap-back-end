import { Router } from 'express';
import { MessageController } from './message.controller.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();
const controller = new MessageController();

router.use(authenticate);

router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.post('/bulk', controller.createBulk);
router.post('/with-reminder', controller.createWithReminder);
router.post('/test', controller.sendTest);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);
router.delete('/', controller.deleteAll);
router.post('/:id/send', controller.sendNow);

export default router;
