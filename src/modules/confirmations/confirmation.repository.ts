import { supabase } from '../../config/supabase.ts';
import type { Confirmation, CreateConfirmationDto, UpdateConfirmationDto, ConfirmationMessageStatus } from './confirmation.types.ts';

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
      .maybeSingle();

    if (error) return null;
    return data;
  },

  async findByWaMessageId(waMessageId: string): Promise<Confirmation | null> {
    const { data, error } = await supabase
      .from('confirmations')
      .select('*')
      .eq('wa_message_id', waMessageId)
      .maybeSingle();

    if (error) return null;
    return data;
  },

  async create(userId: string, input: CreateConfirmationDto): Promise<Confirmation> {
    const { data, error } = await supabase
      .from('confirmations')
      .insert({
        user_id: userId,
        contact_id: input.contact_id ?? null,
        contact_name: input.contact_name,
        contact_phone: input.contact_phone,
        event_date: input.event_date,
        send_at: input.send_at ?? null,
        message_content: input.message_content ?? null,
        confirmation_response_message: input.confirmation_response_message ?? null,
        cancellation_response_message: input.cancellation_response_message ?? null,
        status: input.status || 'pending',
        message_status: 'pending',
      })
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Erro ao criar confirmação');
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
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Confirmação não encontrada');
    return data;
  },

  async updateJobId(id: string, userId: string, jobId: string): Promise<void> {
    const { error } = await supabase
      .from('confirmations')
      .update({ job_id: jobId, message_status: 'queued', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  },

  async updateMessageStatus(id: string, messageStatus: ConfirmationMessageStatus, waMessageId?: string): Promise<void> {
    const { error } = await supabase
      .from('confirmations')
      .update({
        message_status: messageStatus,
        wa_message_id: waMessageId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;
  },

  async delete(id: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('confirmations')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  },

  async deleteAll(userId: string): Promise<number> {
    const { data, error } = await supabase
      .from('confirmations')
      .delete()
      .eq('user_id', userId)
      .select('id');

    if (error) throw error;
    return data?.length ?? 0;
  },
};
