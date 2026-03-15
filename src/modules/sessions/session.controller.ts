import { Response } from 'express'
import { sessionService } from './session.service'
import { asyncHandler } from '../../shared/utils/asyncHandler'
import type { AuthRequest } from '../auth/auth.types'

export const sessionController = {
  get: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' })
      return
    }

    const session = await sessionService.getOrCreate(userId)
    res.status(200).json(session)
  }),

  start: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' })
      return
    }

    const session = await sessionService.start(userId)
    res.status(200).json({ 
      success: true, 
      status: session.status,
      message: session.status === 'working' 
        ? 'Sessão já está conectada!' 
        : 'Sessão iniciada! Escaneie o QR Code.'
    })
  }),

  getQr: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' })
      return
    }

    try {
      const result = await sessionService.getQRCode(userId)
      res.status(200).json(result)
    } catch (error: any) {
      res.status(400).json({ error: error.message })
    }
  }),

  getStatus: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' })
      return
    }

    const status = await sessionService.getStatus(userId)
    res.json({
      connected: status.connected,
      status: status.status,
      error: status.error,
      phone: status.phone,
      pushName: status.pushName,
    })
  }),

  stop: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' })
      return
    }

    const session = await sessionService.stop(userId)
    res.status(200).json(session)
  }),

  logout: asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' })
      return
    }

    await sessionService.logout(userId)
    res.status(200).json({ success: true, message: 'Sessão desconectada com sucesso' })
  }),
}
