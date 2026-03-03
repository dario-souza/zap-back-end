import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import cors from 'cors'

import userRoutes from './modules/users/user.routes.ts'
import messageRoutes from './modules/messages/message.routes.ts'
import contactRoutes from './modules/contacts/contact.routes.ts'
import wahaRoutes from './modules/waha/waha.routes.ts'
import templateRoutes from './modules/templates/template.routes.ts'
import confirmationRoutes from './modules/confirmations/confirmation.routes.ts'
import { errorHandler } from './lib/baseController.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

const corsOptions: cors.CorsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}

app.use(cors(corsOptions))
app.use(express.json())

app.use(express.static(path.join(__dirname, '../public')))

app.use('/api/users', userRoutes)
app.use('/api/messages', messageRoutes)
app.use('/api/contacts', contactRoutes)
app.use('/api/whatsapp', wahaRoutes)
app.use('/api/templates', templateRoutes)
app.use('/api/confirmations', confirmationRoutes)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.get('/whatsapp-connect', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/whatsapp-connect.html'))
})

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  errorHandler(err, res)
})

export default app
