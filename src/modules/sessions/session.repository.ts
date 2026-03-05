import { supabase } from '../../config/supabase.ts';
import { UpdateSessionDto } from './session.types.ts';

export const sessionRepository = {
  async findByUser(userId: string) {
    const { data, error } = await supabase
      .from('whatsapp_sessions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async findOne(id: string, userId: string) {
    const { data, error } = await supabase
      .from('whatsapp_sessions')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return data;
  },

  async create(userId: string, sessionName: string) {
    const { data, error } = await supabase
      .from('whatsapp_sessions')
      .insert({ user_id: userId, session_name: sessionName })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(userId: string, dto: UpdateSessionDto) {
    const { data, error } = await supabase
      .from('whatsapp_sessions')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async upsert(userId: string, sessionName: string, status: string = 'stopped') {
    const existing = await this.findByUser(userId);
    
    if (existing) {
      const { data, error } = await supabase
        .from('whatsapp_sessions')
        .update({ 
          session_name: sessionName, 
          status,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const { data, error } = await supabase
        .from('whatsapp_sessions')
        .insert({ user_id: userId, session_name: sessionName, status })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
  },

  async delete(userId: string) {
    const { error } = await supabase
      .from('whatsapp_sessions')
      .delete()
      .eq('user_id', userId);
    if (error) throw error;
  },
};
