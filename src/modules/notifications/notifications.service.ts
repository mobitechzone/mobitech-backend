import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationType, Prisma, RepairStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    type: NotificationType;
    title: string;
    message: string;
    entity?: string;
    entityId?: string;
    userId?: string | null;
  }) {
    return this.prisma.notification.create({
      data: {
        type: data.type,
        title: data.title,
        message: data.message,
        entity: data.entity,
        entityId: data.entityId,
        userId: data.userId,
      },
    });
  }

  async list(query: { page?: number; limit?: number; unreadOnly?: boolean }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.NotificationWhereInput = {
      ...(query.unreadOnly ? { isRead: false } : {}),
    };
    const [items, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { isRead: false } }),
    ]);
    return { items, total, unread, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async markRead(id: string) {
    return this.prisma.notification.update({ where: { id }, data: { isRead: true } });
  }

  async markAllRead() {
    await this.prisma.notification.updateMany({ data: { isRead: true } });
    return { message: 'All notifications marked as read' };
  }

  async remove(id: string) {
    await this.prisma.notification.delete({ where: { id } });
    return { message: 'Notification deleted' };
  }

  @Cron(CronExpression.EVERY_HOUR)
  async generateAlerts() {
    try {
      const [lowStock, outOfStock, overdueRepairs, pendingRepairs] = await Promise.all([
        this.prisma.product.findMany({ where: { status: 'ACTIVE', currentStock: { gt: 0 } }, include: { category: true } }),
        this.prisma.product.findMany({ where: { status: 'ACTIVE', currentStock: 0 } }),
        this.prisma.repair.findMany({
          where: { estimatedFinish: { lt: new Date() }, status: { notIn: [RepairStatus.DELIVERED, RepairStatus.CANCELLED] } },
        }),
        this.prisma.repair.findMany({ where: { status: { in: [RepairStatus.RECEIVED, RepairStatus.DIAGNOSING, RepairStatus.WAITING_FOR_PARTS, RepairStatus.IN_PROGRESS] } } }),
      ]);

      const existingKeys = new Set(
        (await this.prisma.notification.findMany({ select: { entityId: true }, take: 200 })).map((n) => n.entityId),
      );

      for (const p of lowStock) {
        if (p.currentStock <= p.minStock && !existingKeys.has(p.id)) {
          await this.create({
            type: NotificationType.LOW_STOCK,
            title: 'Low stock alert',
            message: `"${p.name}" is low on stock (${p.currentStock} left, min ${p.minStock}).`,
            entity: 'PRODUCT',
            entityId: p.id,
          });
        }
      }

      for (const p of outOfStock) {
        if (!existingKeys.has(p.id)) {
          await this.create({
            type: NotificationType.OUT_OF_STOCK,
            title: 'Out of stock',
            message: `"${p.name}" is out of stock.`,
            entity: 'PRODUCT',
            entityId: p.id,
          });
        }
      }

      for (const r of overdueRepairs) {
        if (!existingKeys.has(r.id)) {
          await this.create({
            type: NotificationType.OVERDUE_REPAIRS,
            title: 'Overdue repair',
            message: `Repair ${r.repairNumber} (${r.customerName}) is overdue.`,
            entity: 'REPAIR',
            entityId: r.id,
          });
        }
      }

      if (pendingRepairs.length > 0 && !existingKeys.has(`pending-${new Date().toDateString()}`)) {
        await this.create({
          type: NotificationType.PENDING_REPAIRS,
          title: 'Pending repairs',
          message: `${pendingRepairs.length} repair(s) are currently in progress.`,
          entity: 'REPAIR',
          entityId: `pending-${new Date().toDateString()}`,
        });
      }
    } catch (e) {
      this.logger.error('Failed to generate notifications', e);
    }
  }

  @Cron('0 9 * * 1')
  async backupReminder() {
    await this.create({
      type: NotificationType.BACKUP_REMINDER,
      title: 'Database backup reminder',
      message: 'It is time to create a database backup for this week.',
      entity: 'SYSTEM',
    });
  }
}
