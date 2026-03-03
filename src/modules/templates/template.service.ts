import { supabase } from '../../lib/supabase.js';

interface Template {
  id: string;
  user_id: string;
  name: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export class TemplateService {
  async getAll(userId: string): Promise<Template[]> {
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return data || [];
  }

  async create(userId: string, name: string, content: string): Promise<Template> {
    const { data, error } = await supabase
      .from('templates')
      .insert({
        user_id: userId,
        name,
        content,
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async update(userId: string, id: string, name?: string, content?: string): Promise<Template> {
    const updateData: { name?: string; content?: string; updated_at: string } = {
      updated_at: new Date().toISOString(),
    };

    if (name) updateData.name = name;
    if (content) updateData.content = content;

    const { data, error } = await supabase
      .from('templates')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async delete(userId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from('templates')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }
  }

  async deleteAll(userId: string): Promise<void> {
    const { error } = await supabase
      .from('templates')
      .delete()
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }
  }
}
