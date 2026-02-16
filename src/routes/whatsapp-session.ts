import { Router } from 'express';
import { authenticate } from '../middlewares/auth.ts';
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
router.get('/session', authenticate, getOrCreateUserSession);

/**
 * @route   POST /api/whatsapp/session/start
 * @desc    Inicia a sessão do WhatsApp do usuário
 * @access  Private
 */
router.post('/session/start', authenticate, startUserSession);

/**
 * @route   GET /api/whatsapp/session/qr
 * @desc    Obtém QR Code da sessão do usuário
 * @access  Private
 */
router.get('/session/qr', authenticate, getUserQRCode);

/**
 * @route   POST /api/whatsapp/session/disconnect
 * @desc    Desconecta a sessão do usuário
 * @access  Private
 */
router.post('/session/disconnect', authenticate, disconnectUserSession);

/**
 * @route   DELETE /api/whatsapp/session
 * @desc    Deleta a sessão do usuário
 * @access  Private
 */
router.delete('/session', authenticate, deleteUserSession);

/**
 * @route   GET /api/whatsapp/session/status
 * @desc    Verifica status da conexão do usuário
 * @access  Private
 */
router.get('/session/status', authenticate, getUserConnectionStatus);

/**
 * @route   GET /api/whatsapp/sessions
 * @desc    Lista todas as sessões (admin apenas)
 * @access  Private/Admin
 */
router.get('/sessions', authenticate, listAllSessions);

export default router;
