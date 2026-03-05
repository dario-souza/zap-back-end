import { Router, Request, Response } from 'express';
import { supabase } from '../../config/supabase.ts';

export const authRoutes = Router();

authRoutes.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email e senha são obrigatórios' });
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      res.status(401).json({ error: error.message });
      return;
    }

    res.json({
      user: data.user,
      session: data.session,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

authRoutes.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email e senha são obrigatórios' });
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name || email.split('@')[0],
        },
      },
    });

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.json({
      user: data.user,
      session: data.session,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

authRoutes.get('/me', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      res.status(401).json({ error: 'Token não fornecido' });
      return;
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: 'Token inválido' });
      return;
    }

    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});
