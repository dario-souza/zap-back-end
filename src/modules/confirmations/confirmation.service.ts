import { supabase } from '../../lib/supabase.js';

interface Confirmation {
  id: string;
  user_id: string;
  contact_name: string;
  contact_phone: string;
  event_date: string;
  message_content?: string;
  status: string;
  response?: string;
  responded_at?: string;
  created_at: string;
  updated_at: string;
}

export class ConfirmationService {
  async getAll(userId: string): Promise<Confirmation[]> {
    const { data, error } = await supabase
      .from('confirmations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return data || [];
  }

  async create(
    userId: string,
    contactName: string,
    contactPhone: string,
    eventDate: string,
    messageContent?: string
  ): Promise<Confirmation> {
    const { data, error } = await supabase
      .from('confirmations')
      .insert({
        user_id: userId,
        contact_name: contactName,
        contact_phone: contactPhone,
        event_date: eventDate,
        message_content: messageContent,
        status: 'PENDING',
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  async update(userId: string, id: string, status: string, response?: string): Promise<Confirmation> {
    const updateData: { status: string; response?: string; responded_at: string; updated_at: string } = {
      status,
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (response) updateData.response = response;

    const { data, error } = await supabase
      .from('confirmations')
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
      .from('confirmations')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw new Error(error.message);
    }
  }
}
