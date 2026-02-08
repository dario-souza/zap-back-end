export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  cpf?: string;
  address?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type MessageType = 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO';
export type MessageStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SCHEDULED';

export interface Message {
  id: string;
  content: string;
  type: MessageType;
  status: MessageStatus;
  scheduledAt?: Date;
  sentAt?: Date;
  userId: string;
  contactId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthRequest {
  userId?: string;
}
