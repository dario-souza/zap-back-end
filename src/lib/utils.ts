interface ContactData {
  name: string;
  email?: string | null;
}

export function processTemplateVariables(content: string, contact: ContactData): string {
  if (!content || !contact) return content;

  return content
    .replace(/\{\{nome\}\}/gi, contact.name || '')
    .replace(/\{\{email\}\}/gi, contact.email || '');
}
