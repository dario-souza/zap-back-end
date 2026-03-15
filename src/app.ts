import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import cors from 'cors'

import { messageRoutes } from './modules/messages/message.routes'
import { contactRoutes } from './modules/contacts/contact.routes'
import { sessionRoutes } from './modules/sessions/session.routes'
import { templateRoutes } from './modules/templates/template.routes'
import { confirmationRoutes } from './modules/confirmations/confirmation.routes'
import { webhookRoutes } from './modules/webhooks/webhook.routes'
import { authRoutes } from './modules/auth/auth.routes'
import { userRoutes } from './modules/users/user.routes'
import { errorHandler } from './shared/errors/errorHandler'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

const corsOptions: cors.CorsOptions = {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}

app.use(cors(corsOptions))
app.use(express.json())

app.use(express.static(path.join(__dirname, '../public')))

app.use('/api/messages', messageRoutes)
app.use('/api/contacts', contactRoutes)
app.use('/api/sessions', sessionRoutes)
app.use('/api/templates', templateRoutes)
app.use('/api/confirmations', confirmationRoutes)
app.use('/api/webhooks', webhookRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    errorHandler(err, res)
  },
)

export default app
