import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma.ts'

export interface AuthRequest extends Request {
  userId?: string
  user?: {
    id: string
    email: string
    name: string | null
  }
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const token = req.headers.authorization?.split(' ')[1]

    if (!token) {
      res.status(401).json({ error: 'Token não fornecido' })
      return
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      userId: string
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    })

    if (!user) {
      res.status(401).json({ error: 'Usuário não encontrado' })
      return
    }

    req.userId = decoded.userId
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
    }
    next()
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' })
  }
}
