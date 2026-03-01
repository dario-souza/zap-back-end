export interface Contact {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  email?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateContactInput {
  name: string;
  phone: string;
  email?: string;
}

export interface UpdateContactInput {
  name?: string;
  phone?: string;
  email?: string;
}
