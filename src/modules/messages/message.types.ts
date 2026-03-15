export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'cancelled' | 'PENDING' | 'SCHEDULED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'CANCELLED';
export type RecurrenceType = 'NONE' | 'WEEKLY' | 'MONTHLY';
export type MessageType = 'instant' | 'scheduled' | 'recurring';

export interface Message {
  id: string;
  user_id: string;
  contact_id?: string;
  phone: string;
  content: string;
  type: MessageType;
  status: MessageStatus;
  scheduled_at?: string;
  sent_at?: string;
  created_at: string;
  updated_at: string;
  recurrence_type: RecurrenceType;
  recurrence_cron?: string;
  reminder_days: number;
  is_reminder: boolean;
  parent_message_id?: string;
  reminder_sent: boolean;
  next_send_at?: string;
  job_id?: string;
  wa_message_id?: string;
}

export interface CreateMessageDto {
  phone: string;
  content: string;
  contact_id?: string;
  type?: MessageType;
  scheduled_at?: string;
  recurrence_type?: RecurrenceType;
  recurrence_cron?: string;
  reminder_days?: number;
  is_reminder?: boolean;
  status?: MessageStatus;
}

export interface UpdateMessageDto {
  content?: string;
  status?: MessageStatus;
  scheduled_at?: string;
}

export interface SendMessageJobData {
  messageId: string;
  phone: string;
  content: string;
  scheduledAt?: string;
  userId: string;
}
