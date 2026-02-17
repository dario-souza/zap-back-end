import type { Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { wahaService } from '../services/waha.ts'
import type { AuthRequest } from '../middlewares/auth.ts'

const prisma = new PrismaClient()

/**
 * Obtém ou cria a sessão do WhatsApp do usuário logado
 */
export const getOrCreateUserSession = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id

    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' })
      return
    }

    const sessionName = wahaService.generateSessionName(userId)

    // Busca sessão no banco
    let session = await prisma.whatsAppSession.findFirst({
      where: { userId },
    })

    // Se não existe, cria no banco
    if (!session) {
      session = await prisma.whatsAppSession.create({
        data: {
          sessionId: sessionName,
          name: sessionName,
          userId,
          isDefault: true,
        },
      })
    }

    // Verifica status na WAHA
    const wahaSession = await wahaService.getSessionInfo(sessionName)

    // Atualiza status no banco
    await prisma.whatsAppSession.update({
      where: { id: session.id },
      data: {
        status: wahaSession.status || 'STOPPED',
        phoneNumber:
          wahaSession.me?.id?.replace('@c.us', '').replace('@lid', '') || null,
        profileName: wahaSession.me?.pushName || null,
      },
    })

    res.json({
      success: true,
      session: {
        id: session.id,
        sessionId: session.sessionId,
        name: session.name,
        status: wahaSession.status,
        phoneNumber:
          wahaSession.me?.id?.replace('@c.us', '').replace('@lid', '') || null,
        profileName: wahaSession.me?.pushName || null,
        isDefault: session.isDefault,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
    })
  } catch (error: any) {
    console.error('Erro ao obter sessão do usuário:', error)
    res.status(500).json({
      error: 'Erro ao obter sessão',
      message: error.message,
    })
  }
}

/**
 * Inicia a sessão do WhatsApp do usuário logado
 */
export const startUserSession = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
    
    console.log('[DEBUG] req.user:', req.user)
    console.log('[DEBUG] userId:', userId)

    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' })
      return
    }

    const sessionName = wahaService.generateSessionName(userId)
    console.log('[DEBUG] sessionName:', sessionName)

    // Busca ou cria sessão no banco
    let session = await prisma.whatsAppSession.findFirst({
      where: { userId },
    })

    if (!session) {
      session = await prisma.whatsAppSession.create({
        data: {
          sessionId: sessionName,
          name: sessionName,
          userId,
          isDefault: true,
        },
      })
    }

    // Obtém status atual
    const currentSession = await wahaService.getSessionInfo(sessionName)
    console.log(
      `[WhatsApp User ${userId}] Status atual:`,
      currentSession.status,
    )

    // Lógica de inicialização baseada no status
    if (currentSession.status === 'FAILED') {
      console.log(
        `[WhatsApp User ${userId}] Sessão em FAILED, deletando e recriando...`,
      )
      await wahaService.deleteSession(sessionName)
      await new Promise((resolve) => setTimeout(resolve, 1000))
      await wahaService.createSession(sessionName)
      await new Promise((resolve) => setTimeout(resolve, 2000))
      await wahaService.startSession(sessionName)
    } else if (currentSession.status === 'STOPPED') {
      console.log(`[WhatsApp User ${userId}] Sessão STOPPED, iniciando...`)
      await wahaService.createSession(sessionName)
      await wahaService.startSession(sessionName)
    } else if (currentSession.status === 'WORKING') {
      console.log(`[WhatsApp User ${userId}] Sessão já WORKING`)
      res.json({
        success: true,
        message: 'Sessão já está conectada',
        session: currentSession,
      })
      return
    } else {
      await wahaService.createSession(sessionName)
      await wahaService.startSession(sessionName)
    }

    // Aguarda inicialização
    await new Promise((resolve) => setTimeout(resolve, 3000))

    const sessionInfo = await wahaService.getSessionInfo(sessionName)
    console.log(`[WhatsApp User ${userId}] Status final:`, sessionInfo.status)

    // Atualiza banco
    await prisma.whatsAppSession.update({
      where: { id: session.id },
      data: {
        status: sessionInfo.status || 'STARTING',
        phoneNumber:
          sessionInfo.me?.id?.replace('@c.us', '').replace('@lid', '') || null,
        profileName: sessionInfo.me?.pushName || null,
      },
    })

    if (sessionInfo.status === 'SCAN_QR_CODE') {
      res.json({
        success: true,
        message: 'Escaneie o QR Code para conectar',
        needsQR: true,
        session: sessionInfo,
      })
    } else if (sessionInfo.status === 'FAILED') {
      res.status(500).json({
        success: false,
        error: 'Falha ao iniciar sessão',
        message: 'Verifique se o WAHA está configurado corretamente',
        session: sessionInfo,
      })
    } else {
      res.json({
        success: true,
        message: 'Sessão iniciada com sucesso',
        session: sessionInfo,
      })
    }
  } catch (error: any) {
    console.error('Erro ao iniciar sessão do usuário:', error)
    res.status(500).json({
      error: 'Erro ao iniciar sessão',
      message: error.message,
    })
  }
}

/**
 * Obtém QR Code da sessão do usuário logado
 */
export const getUserQRCode = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id

    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' })
      return
    }

    const sessionName = wahaService.generateSessionName(userId)

    // Primeiro garante que a sessão existe
    let session = await prisma.whatsAppSession.findFirst({
      where: { userId },
    })

    if (!session) {
      session = await prisma.whatsAppSession.create({
        data: {
          sessionId: sessionName,
          name: sessionName,
          userId,
          isDefault: true,
        },
      })
    }

    const qrResult = await wahaService.getQRCode(sessionName)

    // Se conseguiu QR ou está conectado, atualiza banco
    if (qrResult.status === 'WORKING' || qrResult.profile) {
      const sessionInfo = await wahaService.getSessionInfo(sessionName)
      await prisma.whatsAppSession.update({
        where: { id: session.id },
        data: {
          status: 'WORKING',
          phoneNumber:
            sessionInfo.me?.id?.replace('@c.us', '').replace('@lid', '') ||
            null,
          profileName: sessionInfo.me?.pushName || null,
        },
      })
    }

    res.json({
      success: true,
      ...qrResult,
    })
  } catch (error: any) {
    console.error('Erro ao obter QR Code:', error)
    res.status(500).json({
      error: 'Erro ao obter QR Code',
      message: error.message,
    })
  }
}

/**
 * Desconecta a sessão do WhatsApp do usuário logado
 */
export const disconnectUserSession = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id

    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' })
      return
    }

    const sessionName = wahaService.generateSessionName(userId)

    await wahaService.disconnect(sessionName)

    // Atualiza status no banco
    const session = await prisma.whatsAppSession.findFirst({
      where: { userId },
    })

    if (session) {
      await prisma.whatsAppSession.update({
        where: { id: session.id },
        data: {
          status: 'STOPPED',
        },
      })
    }

    res.json({
      success: true,
      message: 'Sessão desconectada com sucesso',
    })
  } catch (error: any) {
    console.error('Erro ao desconectar sessão:', error)
    res.status(500).json({
      error: 'Erro ao desconectar sessão',
      message: error.message,
    })
  }
}

/**
 * Deleta a sessão do WhatsApp do usuário logado
 */
export const deleteUserSession = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id

    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' })
      return
    }

    const sessionName = wahaService.generateSessionName(userId)

    await wahaService.deleteSession(sessionName)

    // Remove do banco
    await prisma.whatsAppSession.deleteMany({
      where: { userId },
    })

    res.json({
      success: true,
      message: 'Sessão deletada com sucesso',
    })
  } catch (error: any) {
    console.error('Erro ao deletar sessão:', error)
    res.status(500).json({
      error: 'Erro ao deletar sessão',
      message: error.message,
    })
  }
}

/**
 * Obtém status da conexão do usuário logado
 */
export const getUserConnectionStatus = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id

    if (!userId) {
      res.status(401).json({ error: 'Usuário não autenticado' })
      return
    }

    const sessionName = wahaService.generateSessionName(userId)

    const isConnected = await wahaService.checkConnection(sessionName)
    const sessionInfo = isConnected
      ? await wahaService.getSessionInfo(sessionName)
      : null

    res.json({
      success: true,
      connected: isConnected,
      session: sessionInfo,
    })
  } catch (error: any) {
    console.error('Erro ao verificar status:', error)
    res.status(500).json({
      error: 'Erro ao verificar status',
      message: error.message,
    })
  }
}

/**
 * Lista todas as sessões do WAHA (apenas admin)
 */
export const listAllSessions = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const sessions = await wahaService.listAllSessions()

    res.json({
      success: true,
      sessions,
    })
  } catch (error: any) {
    console.error('Erro ao listar sessões:', error)
    res.status(500).json({
      error: 'Erro ao listar sessões',
      message: error.message,
    })
  }
}
