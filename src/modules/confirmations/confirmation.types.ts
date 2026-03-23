export type ConfirmationStatus = 'pending' | 'confirmed' | 'cancelled';
export type ConfirmationMessageStatus = 'pending' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export interface Confirmation {
  id: string;
  user_id: string;
  contact_id?: string;
  contact_name: string;
  contact_phone: string;
  event_date: string;
  send_at?: string;
  message_content?: string;
  status: ConfirmationStatus;
  message_status: ConfirmationMessageStatus;
  response?: string;
  responded_at?: string;
  wa_message_id?: string;
  job_id?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateConfirmationDto {
  contact_id?: string;
  contact_name: string;
  contact_phone: string;
  event_date: string;
  send_at?: string;
  message_content?: string;
  status?: ConfirmationStatus;
}

export interface UpdateConfirmationDto {
  status?: ConfirmationStatus;
  response?: string;
}
