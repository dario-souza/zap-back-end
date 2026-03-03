import { Router } from 'express';
import { ConfirmationController } from './confirmation.controller.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();
const controller = new ConfirmationController();

router.use(authenticate);

router.get('/', controller.getAll);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);

export default router;
