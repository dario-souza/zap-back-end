import { Response } from 'express'
import { AppError } from './AppError.ts'

export const errorHandler = (err: Error, res: Response): void => {
  console.error(`[Error] ${err.name}:`, err.message)

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
    })
    return
  }

  res.status(500).json({
    error: 'Erro interno do servidor',
  })
}
