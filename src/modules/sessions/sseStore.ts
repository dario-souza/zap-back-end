import type { Response } from 'express'

interface SseConnection {
  res: Response
  userId: string
}

const connections = new Map<string, SseConnection>()

export function registerSseConnection(sessionName: string, res: Response, userId: string): void {
  const existing = connections.get(sessionName)
  if (existing && !existing.res.writableEnded) {
    existing.res.end()
  }

  connections.set(sessionName, { res, userId })
}

export function unregisterSseConnection(sessionName: string): void {
  connections.delete(sessionName)
}

export function sendSseEvent(sessionName: string, eventName: string, data: object): void {
  const conn = connections.get(sessionName)
  if (!conn || conn.res.writableEnded) {
    connections.delete(sessionName)
    return
  }

  conn.res.write(`event: ${eventName}\n`)
  conn.res.write(`data: ${JSON.stringify(data)}\n\n`)
}
