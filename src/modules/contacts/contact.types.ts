export interface Contact {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  email?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateContactDto {
  name: string;
  phone: string;
  email?: string;
}

export interface UpdateContactDto {
  name?: string;
  phone?: string;
  email?: string;
}
