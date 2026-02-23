import { Router } from 'express';
import { confirmationController } from '../controllers/confirmation.ts';
import { authMiddleware } from '../middlewares/auth.ts';

const router = Router();

router.use(authMiddleware);

router.get('/', confirmationController.getAllConfirmations);
router.post('/', confirmationController.createConfirmation);
router.get('/:id', confirmationController.getConfirmationById);
router.put('/:id', confirmationController.updateConfirmationStatus);
router.delete('/:id', confirmationController.deleteConfirmation);

export default router;
