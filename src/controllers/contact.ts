import type { Response } from 'express'
import { prisma } from '../lib/prisma.ts'
import type { AuthRequest } from '../middlewares/auth.ts'

export const getAllContacts = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id

    const contacts = await prisma.contact.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })

    res.json(contacts)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar contatos' })
  }
}

export const getContactById = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
    const { id } = req.params

    const contact = await prisma.contact.findFirst({
      where: { id, userId },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    })

    if (!contact) {
      res.status(404).json({ error: 'Contato não encontrado' })
      return
    }

    res.json(contact)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar contato' })
  }
}

export const createContact = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
    const { name, phone, email } = req.body

    const existingContact = await prisma.contact.findFirst({
      where: { phone, userId },
    })

    if (existingContact) {
      res.status(400).json({ error: 'Contato com este telefone já existe' })
      return
    }

    const contact = await prisma.contact.create({
      data: {
        name,
        phone,
        email,
        userId,
      },
    })

    res.status(201).json(contact)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar contato' })
  }
}

export const updateContact = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
    const { id } = req.params
    const { name, phone, email } = req.body

    const existingContact = await prisma.contact.findFirst({
      where: { id, userId },
    })

    if (!existingContact) {
      res.status(404).json({ error: 'Contato não encontrado' })
      return
    }

    const contact = await prisma.contact.update({
      where: { id },
      data: {
        name,
        phone,
        email,
      },
    })

    res.json(contact)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar contato' })
  }
}

export const deleteContact = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
    const { id } = req.params

    const existingContact = await prisma.contact.findFirst({
      where: { id, userId },
    })

    if (!existingContact) {
      res.status(404).json({ error: 'Contato não encontrado' })
      return
    }

    await prisma.contact.delete({
      where: { id },
    })

    res.json({ message: 'Contato excluído com sucesso' })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir contato' })
  }
}

export const deleteAllContacts = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id

    const { count } = await prisma.contact.deleteMany({
      where: { userId },
    })

    res.json({ message: `${count} contatos excluídos com sucesso` })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir contatos' })
  }
}

export const exportContactsCSV = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id

    const contacts = await prisma.contact.findMany({
      where: { userId },
      select: {
        name: true,
        phone: true,
        email: true,
      },
      orderBy: { name: 'asc' },
    })

    const csvHeader = 'nome,telefone,email\n'
    const csvRows = contacts
      .map((c) => {
        const name = `"${c.name.replace(/"/g, '""')}"`
        const phone = `"${c.phone}"`
        const email = c.email ? `"${c.email.replace(/"/g, '""')}"` : ''
        return `${name},${phone},${email}`
      })
      .join('\n')

    const csv = csvHeader + csvRows

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename=contatos.csv')
    res.send(csv)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao exportar contatos' })
  }
}

export const importContactsCSV = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.id
    const { csvContent } = req.body

    if (!csvContent || typeof csvContent !== 'string') {
      res.status(400).json({ error: 'Conteúdo CSV não fornecido' })
      return
    }

    const lines = csvContent.split('\n').filter((line) => line.trim())
    
    if (lines.length < 2) {
      res.status(400).json({ error: 'CSV deve ter pelo menos uma linha de dados' })
      return
    }

    // Pula o cabeçalho (primeira linha)
    const dataLines = lines.slice(1)

    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    }

    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i].trim()
      if (!line) continue

      // Parse CSV line (trata campos entre aspas)
      const parts: string[] = []
      let current = ''
      let inQuotes = false

      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === ',' && !inQuotes) {
          parts.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      parts.push(current.trim())

      const [name, phone, email] = parts

      // Validações
      if (!name) {
        results.failed++
        results.errors.push(`Linha ${i + 2}: Nome é obrigatório`)
        continue
      }

      if (!phone) {
        results.failed++
        results.errors.push(`Linha ${i + 2}: Telefone é obrigatório`)
        continue
      }

      // Remove caracteres não numéricos do telefone
      const cleanPhone = phone.replace(/\D/g, '')

      // Verifica se telefone já existe
      const existingContact = await prisma.contact.findFirst({
        where: { phone: cleanPhone, userId },
      })

      if (existingContact) {
        results.failed++
        results.errors.push(`Linha ${i + 2}: Telefone ${phone} já existe`)
        continue
      }

      try {
        await prisma.contact.create({
          data: {
            name,
            phone: cleanPhone,
            email: email || null,
            userId,
          },
        })
        results.success++
      } catch (err) {
        results.failed++
        results.errors.push(`Linha ${i + 2}: Erro ao criar contato`)
      }
    }

    res.json(results)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao importar contatos' })
  }
}
