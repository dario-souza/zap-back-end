import { Response, NextFunction } from 'express';
import type { AuthRequest } from '../middleware/auth.ts';

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errorHandler = (err: Error, res: Response) => {
  console.error(`[Error] ${err.name}:`, err.message);

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
  }

  return res.status(500).json({
    error: 'Erro interno do servidor',
  });
};

export const asyncHandler = (
  fn: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>
) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export const getUserId = (req: AuthRequest): string => {
  if (!req.user?.id) {
    throw new AppError('Usuário não autenticado', 401);
  }
  return req.user.id;
};
