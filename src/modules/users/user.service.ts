import { userRepository } from './user.repository.ts';
import type { User, UpdateUserDto } from './user.types.ts';

export const userService = {
  async getProfile(userId: string): Promise<User | null> {
    return userRepository.findById(userId);
  },

  async updateProfile(userId: string, input: UpdateUserDto): Promise<User> {
    return userRepository.update(userId, input);
  },
};
