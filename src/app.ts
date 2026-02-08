import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.ts';
import contactRoutes from './routes/contacts.ts';
import messageRoutes from './routes/messages.ts';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/messages', messageRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;
