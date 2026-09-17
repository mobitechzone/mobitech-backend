import { Injectable, UnauthorizedException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { User, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload, TokenPair } from './auth.types';
import { LoginDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private accessSecret = () => this.config.get<string>('jwt.accessSecret', 'dev-secret');
  private refreshSecret = () => this.config.get<string>('jwt.refreshSecret', 'dev-secret');

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return null;
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return null;
    return user;
  }

  async login(dto: LoginDto, ipAddress?: string): Promise<{ user: User; tokens: TokenPair }> {
    const user = await this.validateUser(dto.email, dto.password);
    if (!user) {
      await this.audit.log({
        action: 'LOGIN',
        entity: 'AUTH',
        details: { email: dto.email, success: false },
        ipAddress,
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Your account is deactivated. Contact an administrator.');
    }

    const tokens = await this.generateTokens(user);
    const rememberMe = dto.rememberMe ?? false;

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: tokens.refreshToken,
        expiresAt: new Date(Date.now() + (rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000),
      },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.prisma.loginHistory.create({
      data: {
        userId: user.id,
        ipAddress,
        device: dto.device,
        userAgent: dto.userAgent,
      },
    });

    await this.audit.log({
      action: 'LOGIN',
      entity: 'AUTH',
      entityId: user.id,
      userId: user.id,
      details: { email: user.email },
      ipAddress,
    });

    const { password, ...safeUser } = user;
    return { user: safeUser as User, tokens };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify(refreshToken, { secret: this.refreshSecret() });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.type !== 'refresh') throw new UnauthorizedException('Invalid token type');

    const stored = await this.prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.revoked || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired or revoked');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account not found or deactivated');
    }

    const tokens = await this.generateTokens(user);

    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true, revokedAt: new Date() } });
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return tokens;
  }

  async logout(refreshToken: string, userId?: string) {
    if (refreshToken) {
      const stored = await this.prisma.refreshToken.findUnique({ where: { token: refreshToken } });
      if (stored) {
        await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true, revokedAt: new Date() } });
      }
    }
    if (userId) {
      await this.audit.log({ action: 'LOGOUT', entity: 'AUTH', entityId: userId, userId });
    }
    return { success: true };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        permission: true,
      },
    });
    if (!user) throw new UnauthorizedException();
    const { password, ...safeUser } = user;
    return safeUser;
  }

  async getUsersEmails() {
    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { email: true, name: true },
      orderBy: { name: 'asc' },
    });
    return users;
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      return { message: 'If that email exists, a reset link has been sent.' };
    }
    const token = uuidv4();
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, token, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    this.logger.log(`Password reset token for ${email}: ${token}`);
    return {
      message: 'If that email exists, a reset link has been sent.',
      ...(process.env.NODE_ENV !== 'production' ? { devToken: token } : {}),
    };
  }

  async resetPassword(token: string, password: string) {
    const record = await this.prisma.passwordResetToken.findUnique({ where: { token } });
    if (!record || record.used || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }
    const hashed = await bcrypt.hash(password, 10);
    await this.prisma.user.update({ where: { id: record.userId }, data: { password: hashed } });
    await this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { used: true } });
    await this.prisma.refreshToken.updateMany({
      where: { userId: record.userId },
      data: { revoked: true, revokedAt: new Date() },
    });
    return { message: 'Password reset successfully. You can now log in.' };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new BadRequestException('Current password is incorrect');
    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { password: hashed } });
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true, revokedAt: new Date() },
    });
    return { message: 'Password changed successfully. Please log in again.' };
  }

  private async generateTokens(user: User): Promise<TokenPair> {
    const accessPayload: JwtPayload = { sub: user.id, email: user.email, role: user.role, type: 'access' };
    const refreshPayload: JwtPayload = { sub: user.id, email: user.email, role: user.role, type: 'refresh' };

    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: this.accessSecret(),
      expiresIn: this.config.get<string>('jwt.accessExpiresIn', '15m'),
    });
    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: this.refreshSecret(),
      expiresIn: this.config.get<string>('jwt.refreshExpiresIn', '7d'),
    });

    const decoded = this.jwtService.decode(accessToken) as { exp: number };
    return { accessToken, refreshToken, expiresIn: decoded.exp };
  }
}
