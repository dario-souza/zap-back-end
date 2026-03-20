import { Response } from 'express'
import { whatsappService } from '../../integrations/whatsapp/whatsapp.service.ts'
import { sessionService } from '../sessions/session.service.ts'
import { asyncHandler } from '../../shared/utils/asyncHandler.ts'
import type { AuthRequest } from '../auth/auth.types.ts'

export const wahaController = {
  getStatus: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' })
      return
    }

    const status = await sessionService.getStatus(userId)

    let qrCode: string | null = null
    if (status.status === 'SCAN_QR_CODE' || status.status === 'STARTING') {
      const qrResult = await sessionService.getQRCode(userId)
      if (qrResult.qr) {
        qrCode = qrResult.qr
      }
    }

    res.json({
      connected: status.connected,
      status: status.status,
      error: status.error,
      phone: status.phone,
      pushName: status.pushName,
      qr: qrCode,
    })
  }),

  getQRCode: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' })
      return
    }

    const result = await sessionService.getQRCode(userId)

    res.json(result)
  }),

  startSession: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' })
      return
    }

    const session = await sessionService.start(userId)

    res.json({
      success: true,
      status: session.status,
      message: session.status === 'working'
        ? 'Sessão já está conectada!'
        : 'Sessão iniciada! Escaneie o QR Code.',
    })
  }),

  disconnect: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' })
      return
    }

    await sessionService.logout(userId)

    res.json({ success: true, message: 'Sessão desconectada com sucesso' })
  }),
}
