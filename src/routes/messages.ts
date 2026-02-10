import { Router } from 'express';
import {
  getAllMessages,
  getMessageById,
  createMessage,
  updateMessage,
  deleteMessage,
  sendMessageNow,
  checkWhatsAppStatus,
  sendTestMessage,
  getQRCode,
  disconnectWhatsApp,
} from '../controllers/message.ts';
import { authMiddleware } from '../middlewares/auth.ts';

const router = Router();

router.use(authMiddleware);

router.get('/', getAllMessages);
router.get('/whatsapp/status', checkWhatsAppStatus);
router.get('/whatsapp/qrcode', getQRCode);
router.post('/whatsapp/disconnect', disconnectWhatsApp);
router.get('/:id', getMessageById);
router.post('/', createMessage);
router.post('/test', sendTestMessage);
router.put('/:id', updateMessage);
router.delete('/:id', deleteMessage);
router.post('/:id/send', sendMessageNow);

export default router;
