export type MessageStatus = 'PENDING' | 'SCHEDULED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
export type RecurrenceType = 'NONE' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface Message {
  id: string;
  user_id: string;
  contact_id?: string;
  phone: string;
  content: string;
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
}

export interface CreateMessageDto {
  phone: string;
  content: string;
  contact_id?: string;
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
