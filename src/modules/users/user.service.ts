import { UserRepository } from './user.repository.js';
import type { User, UpdateUserInput } from './user.types.js';

export class UserService {
  private repository: UserRepository;

  constructor() {
    this.repository = new UserRepository();
  }

  async getProfile(userId: string): Promise<User | null> {
    return this.repository.findById(userId);
  }

  async updateProfile(userId: string, input: UpdateUserInput): Promise<User> {
    return this.repository.update(userId, input);
  }
}
