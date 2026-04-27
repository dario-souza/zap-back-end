import { supabase } from '../../config/supabase.ts';

export interface MessageHistory {
  id: string;
  message_id: string;
  user_id: string;
  phone: string;
  content: string | null;
  type: 'normal' | 'scheduled' | 'recurring' | 'confirmation';
  sent_at: string | null;
  created_at: string;
}

export interface HistoryQueryParams {
  page?: number;
  limit?: number;
  type?: string;
  search?: string;
}

export interface PaginatedHistory {
  data: MessageHistory[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const messageHistoryRepository = {
  async findAll(userId: string, params: HistoryQueryParams = {}): Promise<PaginatedHistory> {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const offset = (page - 1) * limit;

    let query = supabase
      .from('message_history')
      .select('*', { count: 'exact' })
      .eq('user_id', userId);

    if (params.type && params.type !== 'all') {
      query = query.eq('type', params.type);
    }

    if (params.search) {
      const searchTerm = params.search.toLowerCase();
      query = query.or(`phone.ilike.%${searchTerm}%,content.ilike.%${searchTerm}%`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return {
      data: (data || []) as MessageHistory[],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    };
  },

  async getCount(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from('message_history')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) throw error;
    return count || 0;
  },

  async clearAll(userId: string): Promise<void> {
    const { error } = await supabase
      .from('message_history')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;
  },

  async getTotalSentCount(userId: string): Promise<number> {
    // Busca da tabela user_stats (contador que nunca decrementa)
    const { data, error } = await supabase
      .from('user_stats')
      .select('total_sent')
      .eq('user_id', userId)
      .single();

    if (error) {
      // Se não existir registro, retorna 0
      console.log('[Repository] getTotalSentCount error:', error.message)
      return 0
    }
    return data?.total_sent ?? 0
  },

  async getCountsByType(userId: string): Promise<{
    totalSent: number;
    instantSent: number;
    scheduledSent: number;
    recurringSent: number;
  }> {
    // Total de mensagens enviadas (da tabela user_stats - nunca decrementa)
    const { data: userStats, error: statsError } = await supabase
      .from('user_stats')
      .select('total_sent')
      .eq('user_id', userId)
      .single();

const totalSent = userStats?.total_sent ?? 0

    // Instantâneas: sent + sem scheduled_at + recurrence_type = 'NONE'
    const { count: instantSent, error: instantError } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'sent')
      .is('scheduled_at', null)
      .eq('recurrence_type', 'NONE');

    if (instantError) throw instantError;

    // Agendadas: sent + scheduled_at
    const { count: scheduledSent, error: scheduledError } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'sent')
      .not('scheduled_at', 'is', null)
      .eq('recurrence_type', 'NONE');

    if (scheduledError) throw scheduledError;

    // Recorrentes: sent + recurrence_type != 'NONE'
    const { count: recurringSent, error: recurringError } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'sent')
      .neq('recurrence_type', 'NONE');

    if (recurringError) throw recurringError;

    return {
      totalSent: totalSent || 0,
      instantSent: instantSent || 0,
      scheduledSent: scheduledSent || 0,
      recurringSent: recurringSent || 0,
    };
  },
};
