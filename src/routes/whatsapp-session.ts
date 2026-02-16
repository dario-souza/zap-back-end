import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.ts';
import {
  getOrCreateUserSession,
  startUserSession,
  getUserQRCode,
  disconnectUserSession,
  deleteUserSession,
  getUserConnectionStatus,
  listAllSessions,
} from '../controllers/whatsapp-session.ts';

const router = Router();

/**
 * @route   GET /api/whatsapp/session
 * @desc    Obtém ou cria a sessão do usuário logado
 * @access  Private
 */
router.get('/session', authMiddleware, getOrCreateUserSession);

router.post('/session/start', authMiddleware, startUserSession);

router.get('/session/qr', authMiddleware, getUserQRCode);

router.post('/session/disconnect', authMiddleware, disconnectUserSession);

router.delete('/session', authMiddleware, deleteUserSession);

router.get('/session/status', authMiddleware, getUserConnectionStatus);

router.get('/sessions', authMiddleware, listAllSessions);

export default router;
