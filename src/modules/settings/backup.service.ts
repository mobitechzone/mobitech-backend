import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { User, Role } from '@prisma/client';
import { existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync, unlinkSync, createWriteStream } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const EXCLUDED_TABLES = ['refreshToken', 'session', 'loginHistory'];

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);
  private readonly dir = join(process.cwd(), 'backups');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
  }

  private assertAdmin(actor: User) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException('Only administrators can manage backups');
  }

  async createBackup(actor?: User, reason = 'manual') {
    const client = this.prisma as any;
    const data: Record<string, unknown> = {};

    for (const model of PrismaModelNames()) {
      if (EXCLUDED_TABLES.includes(model)) continue;
      try {
        data[model] = await client[model].findMany({ take: 100000 });
      } catch {
        // skip models not exposed
      }
    }

    const payload = {
      app: 'mobitech-pos',
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      reason,
      data,
    };

    const filename = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    writeFileSync(join(this.dir, filename), JSON.stringify(payload, null, 2));

    this.logger.log(`Backup created: ${filename}`);
    if (actor) {
      await this.audit.log({ action: 'BACKUP', entity: 'SYSTEM', entityId: filename, userId: actor.id, details: { reason } });
    }

    return { filename, size: payload.data.length ? JSON.stringify(payload).length : 0, createdAt: payload.createdAt };
  }

  async listBackups() {
    if (!existsSync(this.dir)) return [];
    const files = readdirSync(this.dir).filter((f) => f.endsWith('.json'));
    return files
      .map((f) => {
        const stat = existsSync(join(this.dir, f)) ? require('fs').statSync(join(this.dir, f)) : null;
        return {
          filename: f,
          size: stat?.size ?? 0,
          createdAt: stat?.mtime ?? null,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async restore(filename: string, actor: User) {
    this.assertAdmin(actor);
    const filePath = join(this.dir, filename);
    if (!existsSync(filePath)) throw new NotFoundException('Backup file not found');
    const payload = JSON.parse(readFileSync(filePath, 'utf-8'));

    await this.prisma.$transaction(async (tx) => {
      const client = tx as any;
      // delete existing data (children first is handled by cascade on user)
      for (const model of PrismaModelNames().reverse()) {
        try {
          await client[model].deleteMany({});
        } catch {
          // ignore
        }
      }
      for (const [model, rows] of Object.entries(payload.data ?? {})) {
        const records = rows as Record<string, unknown>[];
        for (const record of records) {
          try {
            await client[model].create({ data: record });
          } catch (e) {
            this.logger.warn(`Skipped ${model} record: ${(e as Error).message}`);
          }
        }
      }
    });

    await this.audit.log({ action: 'RESTORE', entity: 'SYSTEM', entityId: filename, userId: actor.id });
    return { message: 'Backup restored successfully' };
  }

  async deleteBackup(filename: string, actor: User) {
    this.assertAdmin(actor);
    const filePath = join(this.dir, filename);
    if (!existsSync(filePath)) throw new NotFoundException('Backup file not found');
    unlinkSync(filePath);
    await this.audit.log({ action: 'DELETE', entity: 'SYSTEM', entityId: filename, userId: actor.id });
    return { message: 'Backup deleted' };
  }

  async download(filename: string) {
    const filePath = join(this.dir, filename);
    if (!existsSync(filePath)) throw new NotFoundException('Backup file not found');
    return readFileSync(filePath);
  }

  @Cron(CronExpression.EVERY_WEEK)
  async automaticBackup() {
    await this.createBackup(undefined, 'automatic');
  }
}

function PrismaModelNames(): string[] {
  return [
    'setting',
    'auditLog',
    'notification',
    'report',
    'category',
    'supplier',
    'supplierPurchase',
    'product',
    'stockMovement',
    'customer',
    'user',
    'userPermission',
    'passwordResetToken',
    'sale',
    'saleItem',
    'heldSale',
    'payment',
    'repair',
    'repairPart',
    'repairPayment',
    'repairTimeline',
    'repairImage',
    'expense',
  ];
}
