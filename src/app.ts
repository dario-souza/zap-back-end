import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import cors from 'cors'

import userRoutes from './modules/users/user.routes.ts'
import messageRoutes from './modules/messages/message.routes.ts'
import contactRoutes from './modules/contacts/contact.routes.ts'

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

app.use(express.static(path.join(__dirname, '../public')))

app.use('/api/users', userRoutes)
app.use('/api/messages', messageRoutes)
app.use('/api/contacts', contactRoutes)

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.get('/whatsapp-connect', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/whatsapp-connect.html'))
})

export default app
