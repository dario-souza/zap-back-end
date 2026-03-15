export type WahaWebhookEvent = 'message' | 'session.status' | 'message.ack'

export interface WahaWebhookPayload {
  event: WahaWebhookEvent
  session: string
  payload: {
    id?: string
    from?: string
    body?: string
    timestamp?: number
    status?: string
    ack?: number
  }
}

export interface WahaWebhookResponse {
  event: WahaWebhookEvent
  session: string
  payload: {
    id: string
    from: string
    body: string
    timestamp: number
  }
}
