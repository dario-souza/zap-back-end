import { Router } from 'express';
import { ContactController } from './contact.controller.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();
const controller = new ContactController();

router.use(authenticate);

router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.post('/import', controller.importCSV);
router.get('/export', controller.exportCSV);
router.put('/:id', controller.update);
router.delete('/:id', controller.delete);
router.delete('/', controller.deleteAll);

export default router;
