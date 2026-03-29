import { userRepository } from './user.repository.ts'
import { supabase } from '../../config/supabase.ts'
import { AppError } from '../../shared/errors/AppError.ts'
import type { User, UpdateUserDto } from './user.types.ts'

export const userService = {
  async getProfile(userId: string): Promise<User | null> {
    return userRepository.findById(userId)
  },

  async updateProfile(userId: string, input: UpdateUserDto): Promise<User> {
    return userRepository.update(userId, input)
  },

  async deleteAccount(userId: string): Promise<void> {
    const { error } = await supabase.auth.admin.deleteUser(userId)
    if (error) {
      throw new AppError(error.message, 500)
    }
  },
}
