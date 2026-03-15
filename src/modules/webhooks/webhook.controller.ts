import type { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/asyncHandler.ts'
import { webhookService } from './webhook.service.ts'
import type { WahaWebhookPayload } from './webhook.types.ts'

export const webhookController = {
  receive: asyncHandler(async (req: Request, res: Response) => {
    const payload = req.body as WahaWebhookPayload
    
    console.log('[Webhook] Recebido:', payload.event, payload.session)
    
    await webhookService.process(payload)
    
    res.status(200).json({ received: true })
  }),
}
