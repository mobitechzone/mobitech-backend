import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(data: {
    action: AuditAction;
    entity: string;
    entityId?: string;
    userId?: string | null;
    details?: any;
    ipAddress?: string;
  }) {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: data.action,
          entity: data.entity,
          entityId: data.entityId,
          userId: data.userId || null,
          details: data.details ? (JSON.parse(JSON.stringify(data.details)) as Prisma.InputJsonValue) : undefined,
          ipAddress: data.ipAddress,
        },
      });
    } catch (e) {
      this.logger.error('Failed to write audit log', e);
    }
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    action?: AuditAction;
    entity?: string;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const { page = 1, limit = 20 } = params;
    const where: Prisma.AuditLogWhereInput = {
      ...(params.action ? { action: params.action } : {}),
      ...(params.entity ? { entity: params.entity } : {}),
      ...(params.userId ? { userId: params.userId } : {}),
      ...(params.startDate || params.endDate
        ? {
            createdAt: {
              ...(params.startDate ? { gte: params.startDate } : {}),
              ...(params.endDate ? { lte: params.endDate } : {}),
            },
          }
        : {}),
      ...(params.search
        ? {
            OR: [
              { entity: { contains: params.search, mode: 'insensitive' } },
              { entityId: { contains: params.search, mode: 'insensitive' } },
              { user: { name: { contains: params.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
