export interface User {
  id: string;
  email: string;
  name?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateUserDto {
  email: string;
  name?: string;
}

export interface UpdateUserDto {
  name?: string;
}
