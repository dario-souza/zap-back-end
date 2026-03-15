import { supabase } from '../../config/supabase'

interface MessageLog {
  id: string
  message_id: string
  user_id: string
  event: string
  waha_message_id?: string
  metadata?: Record<string, unknown>
  created_at: string
}

interface CreateMessageLogDto {
  messageId: string
  userId: string
  event: string
  wahaMessageId?: string
  metadata?: Record<string, unknown>
}

export const messageLogRepository = {
  async create(input: CreateMessageLogDto): Promise<MessageLog> {
    const { data, error } = await supabase
      .from('message_logs')
      .insert({
        message_id: input.messageId,
        user_id: input.userId,
        event: input.event,
        waha_message_id: input.wahaMessageId,
        metadata: input.metadata || {},
      })
      .select()
      .single()

    if (error) throw error
    return data
  },

  async findByMessageId(messageId: string): Promise<MessageLog[]> {
    const { data, error } = await supabase
      .from('message_logs')
      .select('*')
      .eq('message_id', messageId)
      .order('created_at', { ascending: true })

    if (error) throw error
    return data || []
  },

  async findByUserId(userId: string): Promise<MessageLog[]> {
    const { data, error } = await supabase
      .from('message_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) throw error
    return data || []
  },
}
