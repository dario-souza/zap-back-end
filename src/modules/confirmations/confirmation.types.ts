export type ConfirmationStatus = 'PENDING' | 'CONFIRMED' | 'DENIED';

export interface Confirmation {
  id: string;
  user_id: string;
  contact_name: string;
  contact_phone: string;
  event_date: string;
  message_content?: string;
  status: ConfirmationStatus;
  response?: string;
  responded_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateConfirmationDto {
  contact_name: string;
  contact_phone: string;
  event_date: string;
  message_content?: string;
  status?: ConfirmationStatus;
}

export interface UpdateConfirmationDto {
  status?: ConfirmationStatus;
  response?: string;
}
