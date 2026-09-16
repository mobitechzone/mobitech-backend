import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, User, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getValue(key: string, fallback: unknown = null): Promise<unknown> {
    const setting = await this.prisma.setting.findUnique({ where: { key } });
    return setting?.value ?? fallback;
  }

  async getAll() {
    const settings = await this.prisma.setting.findMany({ orderBy: { group: 'asc' } });
    const flat: Record<string, unknown> = {};
    const grouped: Record<string, Record<string, unknown>> = {};
    for (const s of settings) {
      flat[s.key] = s.value;
      if (!grouped[s.group]) grouped[s.group] = {};
      grouped[s.group][s.key] = s.value;
    }
    return { grouped, flat };
  }

  async set(key: string, value: unknown, group: string | undefined, actor: User) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException('Only administrators can change settings');
    const setting = await this.prisma.setting.upsert({
      where: { key },
      update: { value: value as Prisma.InputJsonValue, group: group ?? undefined, updatedBy: actor.id },
      create: { key, value: value as Prisma.InputJsonValue, group: group ?? 'GENERAL', updatedBy: actor.id },
    });
    await this.audit.log({ action: 'UPDATE', entity: 'SETTINGS', entityId: key, userId: actor.id, details: { key } });
    return setting;
  }

  async bulkUpdate(values: Record<string, unknown>, actor: User) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException('Only administrators can change settings');
    const result: unknown[] = [];
    for (const [key, value] of Object.entries(values)) {
      result.push(
        await this.prisma.setting.upsert({
          where: { key },
          update: { value: value as Prisma.InputJsonValue, updatedBy: actor.id },
          create: { key, value: value as Prisma.InputJsonValue, group: 'GENERAL', updatedBy: actor.id },
        }),
      );
    }
    await this.audit.log({ action: 'UPDATE', entity: 'SETTINGS', userId: actor.id, details: { keys: Object.keys(values) } });
    return this.getAll();
  }

  async remove(key: string, actor: User) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException('Only administrators can delete settings');
    const setting = await this.prisma.setting.findUnique({ where: { key } });
    if (!setting) throw new NotFoundException('Setting not found');
    await this.prisma.setting.delete({ where: { key } });
    await this.audit.log({ action: 'DELETE', entity: 'SETTINGS', entityId: key, userId: actor.id });
    return { message: 'Setting deleted' };
  }
}
