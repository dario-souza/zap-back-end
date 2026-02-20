import { Router } from 'express';
import {
  getAllTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  deleteAllTemplates,
} from '../controllers/template.ts';
import { authMiddleware } from '../middlewares/auth.ts';

const router = Router();

router.use(authMiddleware);

router.get('/', getAllTemplates);
router.get('/:id', getTemplateById);
router.post('/', createTemplate);
router.put('/:id', updateTemplate);
router.delete('/:id', deleteTemplate);
router.delete('/', deleteAllTemplates);

export default router;
