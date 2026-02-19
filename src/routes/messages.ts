import { Router } from 'express';
import {
  getAllMessages,
  getMessageById,
  createMessage,
  updateMessage,
  deleteMessage,
  deleteAllMessages,
  sendMessageNow,
  checkWhatsAppStatus,
  sendTestMessage,
  getQRCode,
  disconnectWhatsApp,
  startWhatsAppSession,
} from '../controllers/message.ts';
import { authMiddleware } from '../middlewares/auth.ts';
import { cronService } from '../services/cron.ts';

const router = Router();

router.use(authMiddleware);

router.get('/', getAllMessages);
router.get('/whatsapp/status', checkWhatsAppStatus);
router.get('/whatsapp/qrcode', getQRCode);
router.post('/whatsapp/start', startWhatsAppSession);
router.post('/whatsapp/disconnect', disconnectWhatsApp);

// Status do cron job
router.get('/cron/status', (req, res) => {
  res.json(cronService.getStatus());
});

// Toggle cron job (iniciar/parar)
router.post('/cron/toggle', (req, res) => {
  const { action } = req.body;
  
  if (action === 'start') {
    cronService.start();
    res.json({ message: 'Cron job iniciado', status: cronService.getStatus() });
  } else if (action === 'stop') {
    cronService.stop();
    res.json({ message: 'Cron job parado', status: cronService.getStatus() });
  } else {
    res.status(400).json({ error: 'Ação inválida. Use "start" ou "stop"' });
  }
});

router.get('/:id', getMessageById);
router.post('/', createMessage);
router.post('/test', sendTestMessage);
router.put('/:id', updateMessage);
router.delete('/:id', deleteMessage);
router.delete('/', deleteAllMessages);
router.post('/:id/send', sendMessageNow);

export default router;
