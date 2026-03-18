import { Response } from 'express'

const clients = new Map<string, Set<Response>>()

export const sseClients = {
  add(session: string, res: Response): void {
    if (!clients.has(session)) {
      clients.set(session, new Set())
    }
    clients.get(session)!.add(res)
  },

  remove(session: string, res: Response): void {
    clients.get(session)?.delete(res)
  },

  send(session: string, event: string, payload: object): void {
    const sessionClients = clients.get(session)
    if (!sessionClients?.size) return

    const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`

    for (const client of sessionClients) {
      try {
        client.write(data)
      } catch {
        sessionClients.delete(client)
      }
    }
  },
}
