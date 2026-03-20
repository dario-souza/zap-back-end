import { supabase } from '../../config/supabase.ts';
import type { Confirmation, CreateConfirmationDto, UpdateConfirmationDto } from './confirmation.types.ts';

export const confirmationRepository = {
  async findAll(userId: string): Promise<Confirmation[]> {
    const { data, error } = await supabase
      .from('confirmations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async findById(id: string, userId: string): Promise<Confirmation | null> {
    const { data, error } = await supabase
      .from('confirmations')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) return null;
    return data;
  },

  async create(userId: string, input: CreateConfirmationDto): Promise<Confirmation> {
    const { data, error } = await supabase
      .from('confirmations')
      .insert({
        user_id: userId,
        contact_name: input.contact_name,
        contact_phone: input.contact_phone,
        event_date: input.event_date,
        message_content: input.message_content,
        status: input.status || 'pending',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: string, userId: string, input: UpdateConfirmationDto): Promise<Confirmation> {
    const updateData: Record<string, unknown> = {
      ...input,
      updated_at: new Date().toISOString(),
    };

    if (input.status === 'confirmed' || input.status === 'cancelled') {
      updateData.responded_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('confirmations')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(id: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('confirmations')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  },
};
