import { supabase } from '../../lib/supabase.js';
import type { Contact, CreateContactInput, UpdateContactInput } from './contact.types.js';

export class ContactRepository {
  async findAll(userId: string): Promise<Contact[]> {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async findById(id: string, userId: string): Promise<Contact | null> {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) return null;
    return data;
  }

  async create(userId: string, input: CreateContactInput): Promise<Contact> {
    const { data, error } = await supabase
      .from('contacts')
      .insert({
        user_id: userId,
        name: input.name,
        phone: input.phone,
        email: input.email,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(id: string, userId: string, input: UpdateContactInput): Promise<Contact> {
    const { data, error } = await supabase
      .from('contacts')
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
  }

  async delete(id: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  }

  async deleteAll(userId: string): Promise<void> {
    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;
  }
}
