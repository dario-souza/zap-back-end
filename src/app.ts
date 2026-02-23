import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import cors from 'cors'
import authRoutes from './routes/auth.ts'
import contactRoutes from './routes/contacts.ts'
import messageRoutes from './routes/messages.ts'
import webhookRoutes from './routes/webhooks.ts'
import whatsappSessionRoutes from './routes/whatsapp-session.ts'
import templateRoutes from './routes/templates.ts'
import confirmationRoutes from './routes/confirmations.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

app.use(
  cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
)
app.use(express.json())

// Servir arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, '../public')))

app.use('/api/auth', authRoutes)
app.use('/api/contacts', contactRoutes)
app.use('/api/messages', messageRoutes)
app.use('/api/webhooks', webhookRoutes)
app.use('/api/whatsapp', whatsappSessionRoutes)
app.use('/api/templates', templateRoutes)
app.use('/api/confirmations', confirmationRoutes)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Rota para página de conexão WhatsApp
app.get('/whatsapp-connect', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/whatsapp-connect.html'))
})

export default app
