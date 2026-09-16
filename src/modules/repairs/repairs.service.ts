import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma, User, Role, RepairStatus, StockMovementType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateRepairDto,
  UpdateRepairDto,
  ChangeRepairStatusDto,
  AddRepairPartsDto,
  CreateRepairPaymentDto,
  QueryRepairDto,
} from './dto/repairs.dto';
import { AuditService } from '../audit/audit.service';
import { PublicService } from '../public/public.service';
import { round2, round3, toNumber } from '../../common/utils/number.utils';

const repairInclude = {
  customer: { select: { id: true, name: true, phone: true } },
  technician: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  parts: true,
  payments: true,
  timeline: { orderBy: { createdAt: 'asc' }, include: { user: { select: { id: true, name: true } } } },
  images: true,
  chatMessages: { orderBy: { createdAt: 'asc' }, select: { id: true, sender: true, message: true, createdAt: true } },
} satisfies Prisma.RepairInclude;

const COMPLETED_STATUSES: RepairStatus[] = [RepairStatus.READY, RepairStatus.DELIVERED];

@Injectable()
export class RepairsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly publicService: PublicService,
  ) {}

  private canManage(actor: User) {
    if (actor.role !== Role.ADMIN && (actor as any).permissions?.canEditOwnRepairs === false) {
      throw new ForbiddenException('You do not have permission to edit repairs');
    }
  }

  private async nextRepairNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const last = await this.prisma.repair.findFirst({ orderBy: { createdAt: 'desc' } });
    let seq = 1;
    if (last?.repairNumber) {
      const match = last.repairNumber.match(/(\d+)$/);
      if (match) seq = parseInt(match[1], 10) + 1;
    }
    const base = `RPR-${year}-`;
    let number = `${base}${String(seq).padStart(6, '0')}`;
    let exists = await this.prisma.repair.findUnique({ where: { repairNumber: number } });
    while (exists) {
      seq += 1;
      number = `${base}${String(seq).padStart(6, '0')}`;
      exists = await this.prisma.repair.findUnique({ where: { repairNumber: number } });
    }
    return number;
  }

  private computeTotals(parts: { unitCost?: unknown; unitPrice?: unknown; quantity: number }[], laborCost: number, repairCost: number, discount: number) {
    const partsCharged = round3(parts.reduce((acc, p) => acc + toNumber(p.unitPrice) * p.quantity, 0));
    const partsActualCost = round3(parts.reduce((acc, p) => acc + toNumber(p.unitCost) * p.quantity, 0));
    const totalCost = round3(repairCost + laborCost + partsCharged - discount);
    const profit = round3(laborCost - partsActualCost - discount);
    return { partsCharged, partsActualCost, totalCost, profit };
  }

  async create(dto: CreateRepairDto, actor: User, ip?: string) {
    const parts = dto.parts ?? [];
    const laborCost = dto.laborCost ?? 0;
    const repairCost = dto.repairCost ?? 0;
    const discount = dto.discount ?? 0;

    const { partsCharged, partsActualCost, totalCost, profit } = this.computeTotals(parts, laborCost, repairCost, discount);

    // validate part stock before creating
    for (const part of parts) {
      if (part.productId) {
        const product = await this.prisma.product.findUnique({ where: { id: part.productId } });
        if (!product) throw new BadRequestException(`Part product not found: ${part.name}`);
        if (!product.infiniteStock && product.currentStock < part.quantity) {
          throw new BadRequestException(`Insufficient stock for part "${product.name}". Only ${product.currentStock} available.`);
        }
      }
    }

    const repairNumber = await this.nextRepairNumber();
    const trackingToken = this.publicService.generateTrackingToken();

    const repair = await this.prisma.$transaction(async (tx) => {
      const created = await tx.repair.create({
        data: {
          repairNumber,
          trackingToken,
          customerId: dto.customerId || null,
          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
          deviceType: dto.deviceType,
          brand: dto.brand,
          model: dto.model,
          imei: dto.imei,
          devicePassword: dto.devicePassword,
          accessories: dto.accessories,
          problemDescription: dto.problemDescription,
          diagnosis: dto.diagnosis,
          repairNotes: dto.repairNotes,
          technicianId: dto.technicianId || null,
          estimatedFinish: dto.estimatedFinish,
          laborCost,
          repairCost,
          partsCost: partsCharged,
          discount,
          totalCost,
          profit,
          amountPaid: 0,
          remainingBalance: totalCost,
          warranty: dto.warranty,
          internalNotes: dto.internalNotes,
          createdById: actor.id,
          parts: parts.length
            ? {
                create: parts.map((p) => ({
                  productId: p.productId || null,
                  name: p.name,
                  quantity: p.quantity,
                  unitCost: p.unitCost ?? 0,
                  unitPrice: p.unitPrice ?? 0,
                  lineTotal: round3((p.unitPrice ?? 0) * p.quantity),
                })),
              }
            : undefined,
          timeline: {
            create: {
              status: RepairStatus.RECEIVED,
              note: 'Repair received',
              userId: actor.id,
            },
          },
        },
        include: repairInclude,
      });

      for (const part of parts) {
        if (!part.productId) continue;
        const product = await tx.product.findUnique({ where: { id: part.productId } });
        if (!product) continue;
        if (product.infiniteStock) continue;
        await tx.product.update({
          where: { id: part.productId },
          data: {
            currentStock: { decrement: part.quantity },
            stockMovements: {
              create: {
                type: StockMovementType.MANUAL,
                quantity: part.quantity,
                beforeStock: product.currentStock,
                afterStock: product.currentStock - part.quantity,
                reference: repairNumber,
                notes: `Part used in repair ${repairNumber}`,
                userId: actor.id,
              },
            },
          },
        });
      }

      return created;
    });

    await this.audit.log({
      action: 'CREATE',
      entity: 'REPAIR',
      entityId: repair.id,
      userId: actor.id,
      details: { repairNumber, customer: dto.customerName, device: dto.deviceType },
      ipAddress: ip,
    });

    return repair;
  }

  async findAll(query: QueryRepairDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.RepairWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.technicianId ? { technicianId: query.technicianId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.outstanding ? { remainingBalance: { gt: 0 }, status: { notIn: [RepairStatus.CANCELLED, RepairStatus.DELIVERED] } } : {}),
      ...(query.startDate || query.endDate
        ? { dateReceived: { ...(query.startDate ? { gte: query.startDate } : {}), ...(query.endDate ? { lte: query.endDate } : {}) } }
        : {}),
      ...(query.search
        ? {
            OR: [
              { repairNumber: { contains: query.search, mode: 'insensitive' } },
              { customerName: { contains: query.search, mode: 'insensitive' } },
              { customerPhone: { contains: query.search, mode: 'insensitive' } },
              { brand: { contains: query.search, mode: 'insensitive' } },
              { model: { contains: query.search, mode: 'insensitive' } },
              { imei: { contains: query.search, mode: 'insensitive' } },
              { problemDescription: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.repair.findMany({
        where,
        include: repairInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.repair.count({ where }),
    ]);

    const overdue = query.overdue
      ? items.filter((r) => r.estimatedFinish && r.estimatedFinish < new Date() && !COMPLETED_STATUSES.includes(r.status) && r.status !== RepairStatus.CANCELLED)
      : items;

    return { items: query.overdue ? overdue : items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const repair = await this.prisma.repair.findUnique({ where: { id }, include: repairInclude });
    if (!repair) throw new NotFoundException('Repair not found');
    return repair;
  }

  async update(id: string, dto: UpdateRepairDto, actor: User, ip?: string) {
    this.canManage(actor);
    const existing = await this.prisma.repair.findUnique({ where: { id }, include: { parts: true } });
    if (!existing) throw new NotFoundException('Repair not found');
    if (existing.status === RepairStatus.CANCELLED || existing.status === RepairStatus.DELIVERED) {
      throw new BadRequestException('A cancelled or delivered repair cannot be edited');
    }

    const parts = existing.parts;
    const laborCost = dto.laborCost ?? toNumber(existing.laborCost);
    const repairCost = dto.repairCost ?? toNumber(existing.repairCost);
    const discount = dto.discount ?? toNumber(existing.discount);
    const { partsCharged, totalCost, profit } = this.computeTotals(parts, laborCost, repairCost, discount);

    const updated = await this.prisma.repair.update({
      where: { id },
      data: {
        ...dto,
        customerId: dto.customerId ?? existing.customerId,
        technicianId: dto.technicianId ?? existing.technicianId,
        laborCost,
        repairCost,
        partsCost: partsCharged,
        discount,
        totalCost,
        profit,
        remainingBalance: round3(totalCost - toNumber(existing.amountPaid)),
        isPaid: toNumber(existing.amountPaid) >= totalCost && totalCost > 0,
      },
      include: repairInclude,
    });

    await this.audit.log({
      action: 'UPDATE',
      entity: 'REPAIR',
      entityId: id,
      userId: actor.id,
      details: { changes: dto },
      ipAddress: ip,
    });

    return updated;
  }

  async changeStatus(id: string, dto: ChangeRepairStatusDto, actor: User, ip?: string) {
    this.canManage(actor);
    const existing = await this.prisma.repair.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Repair not found');
    if (existing.status === RepairStatus.CANCELLED) {
      throw new BadRequestException('A cancelled repair cannot change status');
    }
    if (existing.status === RepairStatus.DELIVERED) {
      throw new BadRequestException('A delivered repair cannot change status');
    }

    const completionDate = dto.status === RepairStatus.READY || dto.status === RepairStatus.DELIVERED ? new Date() : null;

    const updated = await this.prisma.repair.update({
      where: { id },
      data: {
        status: dto.status,
        ...(completionDate ? { completionDate } : {}),
        timeline: {
          create: {
            status: dto.status,
            note: dto.note,
            userId: actor.id,
          },
        },
      },
      include: repairInclude,
    });

    await this.audit.log({
      action: 'STATUS_CHANGE',
      entity: 'REPAIR',
      entityId: id,
      userId: actor.id,
      details: { repairNumber: existing.repairNumber, from: existing.status, to: dto.status },
      ipAddress: ip,
    });

    return updated;
  }

  async addParts(id: string, dto: AddRepairPartsDto, actor: User, ip?: string) {
    this.canManage(actor);
    const existing = await this.prisma.repair.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Repair not found');
    if (existing.status === RepairStatus.CANCELLED || existing.status === RepairStatus.DELIVERED) {
      throw new BadRequestException('Parts cannot be added to a cancelled or delivered repair');
    }

    for (const part of dto.parts) {
      if (part.productId) {
        const product = await this.prisma.product.findUnique({ where: { id: part.productId } });
        if (!product) throw new BadRequestException(`Part product not found: ${part.name}`);
        if (!product.infiniteStock && product.currentStock < part.quantity) {
          throw new BadRequestException(`Insufficient stock for part "${product.name}". Only ${product.currentStock} available.`);
        }
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const created = await tx.repairPart.createMany({
        data: dto.parts.map((p) => ({
          repairId: id,
          productId: p.productId || null,
          name: p.name,
          quantity: p.quantity,
          unitCost: p.unitCost ?? 0,
          unitPrice: p.unitPrice ?? 0,
          lineTotal: round3((p.unitPrice ?? 0) * p.quantity),
        })),
      });
      void created;

      const allParts = await tx.repairPart.findMany({ where: { repairId: id } });
      const laborCost = toNumber(existing.laborCost);
      const repairCost = toNumber(existing.repairCost);
      const discount = toNumber(existing.discount);
      const amountPaid = toNumber(existing.amountPaid);
      const { partsCharged, totalCost, profit } = this.computeTotals(allParts, laborCost, repairCost, discount);

      const updatedRepair = await tx.repair.update({
        where: { id },
        data: {
          partsCost: partsCharged,
          totalCost,
          profit,
          remainingBalance: round3(totalCost - amountPaid),
          isPaid: amountPaid >= totalCost && totalCost > 0,
          timeline: {
            create: { status: existing.status, note: `Added ${dto.parts.length} part(s)`, userId: actor.id },
          },
        },
        include: repairInclude,
      });

      for (const part of dto.parts) {
        if (!part.productId) continue;
        const product = await tx.product.findUnique({ where: { id: part.productId } });
        if (!product) continue;
        if (product.infiniteStock) continue;
        await tx.product.update({
          where: { id: part.productId },
          data: {
            currentStock: { decrement: part.quantity },
            stockMovements: {
              create: {
                type: StockMovementType.MANUAL,
                quantity: part.quantity,
                beforeStock: product.currentStock,
                afterStock: product.currentStock - part.quantity,
                reference: existing.repairNumber,
                notes: `Part used in repair ${existing.repairNumber}`,
                userId: actor.id,
              },
            },
          },
        });
      }

      return updatedRepair;
    });

    await this.audit.log({
      action: 'UPDATE',
      entity: 'REPAIR',
      entityId: id,
      userId: actor.id,
      details: { repairNumber: existing.repairNumber, addedParts: dto.parts.length },
      ipAddress: ip,
    });

    return updated;
  }

  async addPayment(id: string, dto: CreateRepairPaymentDto, actor: User, ip?: string) {
    const existing = await this.prisma.repair.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Repair not found');
    if (existing.status === RepairStatus.CANCELLED) {
      throw new BadRequestException('Cannot take payment for a cancelled repair');
    }

    const amount = round2(dto.amount);
    const currentPaid = toNumber(existing.amountPaid);
    const total = toNumber(existing.totalCost);
    const newPaid = round2(currentPaid + amount);
    if (newPaid > total + 0.01) {
      throw new BadRequestException(`Payment exceeds the outstanding balance of ${(total - currentPaid).toFixed(3)} TND`);
    }
    const remaining = round2(total - newPaid);

    const updated = await this.prisma.repair.update({
      where: { id },
      data: {
        amountPaid: newPaid,
        remainingBalance: remaining < 0.005 ? 0 : remaining,
        isPaid: newPaid >= total - 0.005,
        payments: {
          create: {
            amount,
            method: dto.method,
            type: dto.type ?? 'PARTIAL',
            note: dto.note,
            userId: actor.id,
          },
        },
        timeline: {
          create: {
            status: existing.status,
            note: `Payment received: ${amount} TND (${dto.type ?? 'PARTIAL'})`,
            userId: actor.id,
          },
        },
      },
      include: repairInclude,
    });

    if (dto.type === 'DEPOSIT' && existing.status === RepairStatus.RECEIVED) {
      await this.prisma.repair.update({
        where: { id },
        data: { status: RepairStatus.DIAGNOSING },
      });
    }

    await this.audit.log({
      action: 'CREATE',
      entity: 'REPAIR_PAYMENT',
      entityId: id,
      userId: actor.id,
      details: { repairNumber: existing.repairNumber, amount, method: dto.method, type: dto.type },
      ipAddress: ip,
    });

    return updated;
  }

  async remove(id: string, actor: User, ip?: string) {
    this.canManage(actor);
    const existing = await this.prisma.repair.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Repair not found');
    await this.prisma.repair.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'REPAIR',
      entityId: id,
      userId: actor.id,
      details: { repairNumber: existing.repairNumber },
      ipAddress: ip,
    });
    return { message: 'Repair deleted' };
  }

  async summary() {
    const [total, received, diagnosing, waiting, inProgress, ready, delivered, cancelled, outstanding] =
      await this.prisma.$transaction([
        this.prisma.repair.count(),
        this.prisma.repair.count({ where: { status: RepairStatus.RECEIVED } }),
        this.prisma.repair.count({ where: { status: RepairStatus.DIAGNOSING } }),
        this.prisma.repair.count({ where: { status: RepairStatus.WAITING_FOR_PARTS } }),
        this.prisma.repair.count({ where: { status: RepairStatus.IN_PROGRESS } }),
        this.prisma.repair.count({ where: { status: RepairStatus.READY } }),
        this.prisma.repair.count({ where: { status: RepairStatus.DELIVERED } }),
        this.prisma.repair.count({ where: { status: RepairStatus.CANCELLED } }),
        this.prisma.repair.aggregate({ _sum: { remainingBalance: true } }),
      ]);

    const overdue = await this.prisma.repair.count({
      where: {
        estimatedFinish: { lt: new Date() },
        status: { notIn: COMPLETED_STATUSES },
      },
    });

    return {
      total,
      received,
      diagnosing,
      waitingForParts: waiting,
      inProgress,
      ready,
      delivered,
      cancelled,
      overdue,
      outstandingBalance: outstanding._sum.remainingBalance ?? 0,
    };
  }

  async getChatMessages(repairId: string) {
    const repair = await this.prisma.repair.findUnique({
      where: { id: repairId },
      select: { id: true },
    });
    if (!repair) throw new NotFoundException('Repair not found');

    return this.prisma.chatMessage.findMany({
      where: { repairId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        sender: true,
        message: true,
        createdAt: true,
      },
    });
  }

  async sendTechnicianMessage(repairId: string, message: string, actor: User) {
    if (!message || message.trim().length === 0) {
      throw new BadRequestException('Message cannot be empty');
    }
    if (message.length > 2000) {
      throw new BadRequestException('Message too long (max 2000 characters)');
    }

    const repair = await this.prisma.repair.findUnique({
      where: { id: repairId },
      select: { id: true, repairNumber: true, customerName: true },
    });
    if (!repair) throw new NotFoundException('Repair not found');

    const chatMessage = await this.prisma.chatMessage.create({
      data: {
        repairId,
        sender: actor.name || 'Technician',
        message: message.trim(),
      },
      select: {
        id: true,
        sender: true,
        message: true,
        createdAt: true,
      },
    });

    return chatMessage;
  }
}
