export type SessionStatus = 'stopped' | 'starting' | 'scan_qr_code' | 'working' | 'failed';

export interface WhatsappSession {
  id:           string;
  user_id:      string;
  session_name: string;
  status:       SessionStatus;
  qr_code?:     string;
  phone_number?: string;
  push_name?:   string;
  connected_at?: string;
  created_at:   string;
  updated_at:   string;
}

export interface UpdateSessionDto {
  status?:       SessionStatus;
  qr_code?:      string | null;
  phone_number?: string;
  push_name?:    string;
  connected_at?: string;
}
