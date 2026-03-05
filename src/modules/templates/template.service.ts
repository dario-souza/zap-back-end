import { templateRepository } from './template.repository.ts';
import type { Template, CreateTemplateDto, UpdateTemplateDto } from './template.types.ts';

export const templateService = {
  async getAll(userId: string): Promise<Template[]> {
    return templateRepository.findAll(userId);
  },

  async getById(id: string, userId: string): Promise<Template | null> {
    return templateRepository.findById(id, userId);
  },

  async create(userId: string, name: string, content: string): Promise<Template> {
    return templateRepository.create(userId, { name, content });
  },

  async update(id: string, userId: string, name?: string, content?: string): Promise<Template> {
    return templateRepository.update(id, userId, { name, content });
  },

  async delete(userId: string, id: string): Promise<void> {
    return templateRepository.delete(id, userId);
  },

  async deleteAll(userId: string): Promise<void> {
    return templateRepository.deleteAll(userId);
  },

  render(body: string, variables: Record<string, string>): string {
    return body.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
  },

  extractVariables(body: string): string[] {
    const matches = body.matchAll(/\{\{(\w+)\}\}/g);
    return [...new Set([...matches].map(m => m[1]))];
  },
};
