import { supabase } from '../../config/supabase.ts';
import type { Message, CreateMessageDto, UpdateMessageDto } from './message.types.ts';

export const messageRepository = {
  async findAll(userId: string): Promise<Message[]> {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async findById(id: string, userId: string): Promise<Message | null> {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) return null;
    return data;
  },

  async create(userId: string, input: CreateMessageDto): Promise<Message> {
    const scheduledAt = input.scheduled_at ? new Date(input.scheduled_at) : null;
    const isScheduled = scheduledAt && scheduledAt > new Date();

    const { data, error } = await supabase
      .from('messages')
      .insert({
        user_id: userId,
        phone: input.phone,
        content: input.content,
        contact_id: input.contact_id,
        scheduled_at: input.scheduled_at,
        status: isScheduled ? 'SCHEDULED' : 'PENDING',
        recurrence_type: input.recurrence_type || 'NONE',
        recurrence_cron: input.recurrence_cron,
        reminder_days: input.reminder_days || 0,
        is_reminder: false,
        next_send_at: input.scheduled_at,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(id: string, userId: string, input: UpdateMessageDto): Promise<Message> {
    const { data, error } = await supabase
      .from('messages')
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
      .from('messages')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  },

  async deleteAll(userId: string): Promise<void> {
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;
  },

  async findScheduled(): Promise<Message[]> {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('status', 'SCHEDULED')
      .lte('scheduled_at', new Date().toISOString());

    if (error) throw error;
    return data || [];
  },

  async findPendingReminders(): Promise<Message[]> {
    const now = new Date();
    const reminderThreshold = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('status', 'SCHEDULED')
      .gt('reminder_days', 0)
      .eq('reminder_sent', false)
      .lte('scheduled_at', reminderThreshold.toISOString());

    if (error) throw error;
    return data || [];
  },

  async findRecurring(): Promise<Message[]> {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .neq('recurrence_type', 'NONE')
      .eq('status', 'SENT');

    if (error) throw error;
    return data || [];
  },
};
