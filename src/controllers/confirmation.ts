import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.ts';
import { ConfirmationStatus } from '@prisma/client';

export class ConfirmationController {
  getAllConfirmations = async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const confirmations = await prisma.confirmation.findMany({
        where: { userId },
        orderBy: { eventDate: 'asc' },
      });

      res.json(confirmations);
    } catch (error: any) {
      console.error('[ConfirmationController] Erro ao buscar confirmações:', error);
      res.status(500).json({ error: error.message });
    }
  };

  createConfirmation = async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { contactName, contactPhone, eventDate, messageContent } = req.body;

      if (!contactName || !contactPhone || !eventDate) {
        return res.status(400).json({ error: 'Campos obrigatórios: contactName, contactPhone, eventDate' });
      }

      const confirmation = await prisma.confirmation.create({
        data: {
          contactName,
          contactPhone,
          eventDate: new Date(eventDate),
          messageContent,
          status: ConfirmationStatus.PENDING,
          userId,
        },
      });

      res.status(201).json(confirmation);
    } catch (error: any) {
      console.error('[ConfirmationController] Erro ao criar confirmação:', error);
      res.status(500).json({ error: error.message });
    }
  };

  updateConfirmationStatus = async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      const { status, response } = req.body;

      if (!status || !['CONFIRMED', 'DENIED'].includes(status)) {
        return res.status(400).json({ error: 'Status deve ser CONFIRMED ou DENIED' });
      }

      const confirmation = await prisma.confirmation.update({
        where: { id },
        data: {
          status: status as ConfirmationStatus,
          response: response || null,
          respondedAt: new Date(),
        },
      });

      res.json(confirmation);
    } catch (error: any) {
      console.error('[ConfirmationController] Erro ao atualizar confirmação:', error);
      res.status(500).json({ error: error.message });
    }
  };

  deleteConfirmation = async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;

      await prisma.confirmation.delete({
        where: { id },
      });

      res.status(204).send();
    } catch (error: any) {
      console.error('[ConfirmationController] Erro ao deletar confirmação:', error);
      res.status(500).json({ error: error.message });
    }
  };

  getConfirmationById = async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;

      const confirmation = await prisma.confirmation.findFirst({
        where: { id, userId },
      });

      if (!confirmation) {
        return res.status(404).json({ error: 'Confirmação não encontrada' });
      }

      res.json(confirmation);
    } catch (error: any) {
      console.error('[ConfirmationController] Erro ao buscar confirmação:', error);
      res.status(500).json({ error: error.message });
    }
  };
}

export const confirmationController = new ConfirmationController();
