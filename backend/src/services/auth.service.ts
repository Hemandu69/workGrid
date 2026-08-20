import { prisma } from '../db/client.js';
import bcrypt from 'bcryptjs';
import { LoginInput } from '../schemas/auth.schema.js';
import { AuthUserPayload } from '../plugins/auth.js';

export class AuthService {
  static async validateCredentials(input: LoginInput): Promise<AuthUserPayload> {
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: {
        room: true,
        subroom: true,
      },
    });

    if (!user) {
      throw new Error('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(input.password, user.passwordHash);
    if (!isMatch) {
      throw new Error('Invalid email or password');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      accountStatus: user.accountStatus,
      organizationId: user.organizationId,
      roomId: user.roomId || undefined,
      subroomId: user.subroomId || undefined,
    };
  }

  static async getUserProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        room: true,
        subroom: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const { passwordHash: _hash, ...profile } = user;
    return profile;
  }
}
