import { Response } from 'express'
import { sessionService } from './session.service'
import { asyncHandler } from '../../shared/utils/asyncHandler'
import type { AuthRequest } from '../auth/auth.types'
import { supabase } from '../../config/supabase'
import { registerSseConnection, unregisterSseConnection } from './sseStore'

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
      sessionName: (session as any).session_name,
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
    const session = await sessionService.getOrCreate(userId)
    res.json({
      connected: status.connected,
      status: status.status,
      error: status.error,
      phone: status.phone,
      pushName: status.pushName,
      sessionName: (session as any).session_name ?? null,
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

  stream: (req: AuthRequest, res: Response) => {
    const token = req.query.token as string | undefined
    const sessionName = req.query.sessionName as string | undefined

    if (!token || !sessionName) {
      res.status(400).json({ error: 'token e sessionName são obrigatórios' })
      return
    }

    supabase.auth.getUser(token).then(async ({ data, error }) => {
      if (error || !data.user) {
        res.status(401).json({ error: 'Token inválido ou expirado' })
        return
      }

      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')
      res.flushHeaders()

      registerSseConnection(sessionName, res, data.user.id)

      res.write(`event: connected\n`)
      res.write(`data: ${JSON.stringify({ ok: true })}\n\n`)

      req.on('close', () => {
        unregisterSseConnection(sessionName)
      })
    })
  },
}
