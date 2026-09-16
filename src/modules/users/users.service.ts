import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Role, Prisma, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto, QueryUserDto } from './dto/users.dto';
import { AuditService } from '../audit/audit.service';

const userSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  avatar: true,
  lastLoginAt: true,
  permission: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateUserDto, actor: User, ip?: string) {
    if (actor.role !== Role.ADMIN) {
      throw new ForbiddenException('Only administrators can create users');
    }
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (exists) throw new ConflictException('A user with this email already exists');

    const hashed = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email.toLowerCase(),
        phone: dto.phone,
        password: hashed,
        role: dto.role,
        status: dto.status,
        permission: {
          create: {
            canDiscount: dto.canDiscount ?? false,
            canCustomPrice: dto.canCustomPrice ?? false,
            canRefund: dto.canRefund ?? false,
            canEditOwnRepairs: dto.canEditOwnRepairs ?? true,
            canViewProfit: dto.canViewProfit ?? true,
            canHoldSale: dto.canHoldSale ?? true,
            canDeleteSale: dto.canDeleteSale ?? false,
          },
        },
      },
      select: userSelect,
    });

    await this.audit.log({
      action: 'CREATE',
      entity: 'USER',
      entityId: user.id,
      userId: actor.id,
      details: { email: user.email, role: user.role },
      ipAddress: ip,
    });

    return user;
  }

  async findAll(query: QueryUserDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, dto: UpdateUserDto, actor: User, ip?: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');

    if (existing.role === Role.ADMIN && actor.id !== id && actor.role !== Role.ADMIN) {
      throw new ForbiddenException('Only an administrator can modify an administrator');
    }

    const data: Prisma.UserUpdateInput = {
      name: dto.name ?? undefined,
      phone: dto.phone ?? undefined,
      status: dto.status ?? undefined,
    };
    if (dto.email) data.email = dto.email.toLowerCase();
    if (dto.role) {
      if (dto.role === Role.ADMIN && actor.id !== id && actor.role !== Role.ADMIN) {
        throw new ForbiddenException('Only an administrator can promote users to admin');
      }
      data.role = dto.role;
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...data,
        permission: {
          update: {
            canDiscount: dto.canDiscount ?? undefined,
            canCustomPrice: dto.canCustomPrice ?? undefined,
            canRefund: dto.canRefund ?? undefined,
            canEditOwnRepairs: dto.canEditOwnRepairs ?? undefined,
            canViewProfit: dto.canViewProfit ?? undefined,
            canHoldSale: dto.canHoldSale ?? undefined,
            canDeleteSale: dto.canDeleteSale ?? undefined,
          },
        },
      },
      select: userSelect,
    });

    await this.audit.log({
      action: 'UPDATE',
      entity: 'USER',
      entityId: id,
      userId: actor.id,
      details: { changes: dto },
      ipAddress: ip,
    });

    return user;
  }

  async remove(id: string, actor: User, ip?: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');
    if (existing.role === Role.ADMIN) {
      throw new BadRequestException('Administrator accounts cannot be deleted. Deactivate them instead.');
    }
    if (existing.id === actor.id) {
      throw new BadRequestException('You cannot delete your own account');
    }
    await this.prisma.user.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'USER',
      entityId: id,
      userId: actor.id,
      details: { email: existing.email },
      ipAddress: ip,
    });
    return { message: 'User deleted' };
  }

  async setStatus(id: string, status: 'ACTIVE' | 'INACTIVE', actor: User, ip?: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');
    if (existing.id === actor.id && status === 'INACTIVE') {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    const user = await this.prisma.user.update({ where: { id }, data: { status }, select: userSelect });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'USER',
      entityId: id,
      userId: actor.id,
      details: { status },
      ipAddress: ip,
    });
    return user;
  }

  async resetPassword(id: string, newPassword: string, actor: User, ip?: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found');
    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id }, data: { password: hashed } });
    await this.prisma.refreshToken.updateMany({ where: { userId: id, revoked: false }, data: { revoked: true, revokedAt: new Date() } });
    await this.audit.log({
      action: 'UPDATE',
      entity: 'USER',
      entityId: id,
      userId: actor.id,
      details: { action: 'password_reset' },
      ipAddress: ip,
    });
    return { message: 'Password reset successfully' };
  }

  async loginHistory(userId: string, query: { page?: number; limit?: number }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.loginHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.loginHistory.count({ where: { userId } }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
