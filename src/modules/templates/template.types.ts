export interface Template {
  id: string;
  user_id: string;
  name: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateDto {
  name: string;
  content: string;
}

export interface UpdateTemplateDto {
  name?: string;
  content?: string;
}

export interface TemplateVariables {
  [key: string]: string;
}
