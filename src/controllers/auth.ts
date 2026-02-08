import { type Request, type Response } from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma.ts'

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, phone, cpf, address } = req.body

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { cpf }],
      },
    })

    if (existingUser) {
      res.status(400).json({ error: 'Email ou CPF já cadastrado' })
      return
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        phone,
        cpf,
        address,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
      },
    })

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' },
    )

    res.status(201).json({ user, token })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar usuário' })
  }
}

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body

    const user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      res.status(401).json({ error: 'Credenciais inválidas' })
      return
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)

    if (!isPasswordValid) {
      res.status(401).json({ error: 'Credenciais inválidas' })
      return
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET as string,
      { expiresIn: '7d' },
    )

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
      token,
    })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao fazer login' })
  }
}

export const logout = async (req: Request, res: Response): Promise<void> => {
  res.json({ message: 'Logout realizado com sucesso' })
}

export const me = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        cpf: true,
        address: true,
        createdAt: true,
      },
    })

    if (!user) {
      res.status(404).json({ error: 'Usuário não encontrado' })
      return
    }

    res.json(user)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar usuário' })
  }
}
