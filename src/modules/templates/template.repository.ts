import { supabase } from '../../config/supabase.ts';
import type { Template, CreateTemplateDto, UpdateTemplateDto } from './template.types.ts';

export const templateRepository = {
  async findAll(userId: string): Promise<Template[]> {
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async findById(id: string, userId: string): Promise<Template | null> {
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) return null;
    return data;
  },

  async create(userId: string, input: CreateTemplateDto): Promise<Template> {
    const { data, error } = await supabase
      .from('templates')
      .insert({
        user_id: userId,
        name: input.name,
        content: input.content,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: string, userId: string, input: UpdateTemplateDto): Promise<Template> {
    const { data, error } = await supabase
      .from('templates')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('templates')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  },

  async deleteAll(userId: string): Promise<void> {
    const { error } = await supabase
      .from('templates')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;
  },
};
