import { supabase } from '../../lib/supabase.js';
import type { User, CreateUserInput, UpdateUserInput } from './user.types.js';

export class UserRepository {
  async findById(id: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) return null;
    return data;
  }

  async findByEmail(email: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', email)
      .single();

    if (error) return null;
    return data;
  }

  async create(input: CreateUserInput & { id: string }): Promise<User> {
    const { data, error } = await supabase
      .from('profiles')
      .insert({
        id: input.id,
        email: input.email,
        name: input.name,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(id: string, input: UpdateUserInput): Promise<User> {
    const { data, error } = await supabase
      .from('profiles')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}
