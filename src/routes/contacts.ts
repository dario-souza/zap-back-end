import { Router } from 'express';
import {
  getAllContacts,
  getContactById,
  createContact,
  updateContact,
  deleteContact,
  deleteAllContacts,
  exportContactsCSV,
  importContactsCSV,
} from '../controllers/contact.ts';
import { authMiddleware } from '../middlewares/auth.ts';

const router = Router();

router.use(authMiddleware);

router.get('/', getAllContacts);
router.get('/export', exportContactsCSV);
router.post('/import', importContactsCSV);
router.get('/:id', getContactById);
router.post('/', createContact);
router.put('/:id', updateContact);
router.delete('/:id', deleteContact);
router.delete('/', deleteAllContacts);

export default router;
