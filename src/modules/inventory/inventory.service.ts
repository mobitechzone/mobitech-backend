import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma, StockMovementType, User, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RecordMovementDto, TransferStockDto, QueryMovementDto } from './dto/inventory.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private assertAdmin(actor: User) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException('Only administrators can manage inventory');
  }

  private async recordMovement(
    productId: string,
    type: StockMovementType,
    quantity: number,
    notes: string | undefined,
    reference: string | undefined,
    actor: User,
  ) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    const before = product.currentStock;
    const isDecrease = type === StockMovementType.SALE || type === StockMovementType.DAMAGED;
    const after = isDecrease ? before - quantity : before + quantity;
    if (after < 0) {
      throw new BadRequestException(`Insufficient stock. Only ${before} available.`);
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: {
        currentStock: after,
        stockMovements: {
          create: {
            type,
            quantity,
            beforeStock: before,
            afterStock: after,
            reference,
            notes,
            userId: actor.id,
          },
        },
      },
      include: { category: true },
    });
  }

  async record(productId: string, dto: RecordMovementDto, actor: User, ip?: string) {
    this.assertAdmin(actor);
    const updated = await this.recordMovement(productId, dto.type, dto.quantity, dto.notes, dto.reference, actor);
    await this.audit.log({
      action: 'UPDATE',
      entity: 'INVENTORY',
      entityId: productId,
      userId: actor.id,
      details: { type: dto.type, quantity: dto.quantity, afterStock: updated.currentStock },
      ipAddress: ip,
    });
    return updated;
  }

  async transfer(productId: string, dto: TransferStockDto, actor: User, ip?: string) {
    this.assertAdmin(actor);
    const updated = await this.recordMovement(productId, StockMovementType.TRANSFER, -dto.quantity, dto.notes, dto.reference, actor);
    await this.audit.log({
      action: 'UPDATE',
      entity: 'INVENTORY',
      entityId: productId,
      userId: actor.id,
      details: { transfer: dto.reference, quantity: dto.quantity },
      ipAddress: ip,
    });
    return updated;
  }

  async damaged(productId: string, dto: RecordMovementDto, actor: User, ip?: string) {
    this.assertAdmin(actor);
    return this.record(productId, { ...dto, type: StockMovementType.DAMAGED }, actor, ip);
  }

  async returns(productId: string, dto: RecordMovementDto, actor: User, ip?: string) {
    this.assertAdmin(actor);
    return this.record(productId, { ...dto, type: StockMovementType.RETURN }, actor, ip);
  }

  async movements(query: QueryMovementDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.StockMovementWhereInput = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.startDate || query.endDate
        ? { createdAt: { ...(query.startDate ? { gte: query.startDate } : {}), ...(query.endDate ? { lte: query.endDate } : {}) } }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        include: { product: { select: { id: true, name: true, sku: true, barcode: true } }, user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async productHistory(productId: string, query: { page?: number; limit?: number }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where: { productId },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.stockMovement.count({ where: { productId } }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async alerts() {
    const products = await this.prisma.product.findMany({ where: { status: 'ACTIVE' }, include: { category: true } });
    return {
      lowStock: products.filter((p) => p.currentStock > 0 && p.currentStock <= p.minStock),
      outOfStock: products.filter((p) => p.currentStock === 0),
    };
  }

  async valuation() {
    const products = await this.prisma.product.findMany({ where: { status: 'ACTIVE' } });
    const cost = products.reduce((acc, p) => acc + Number(p.buyingPrice) * p.currentStock, 0);
    const retail = products.reduce((acc, p) => acc + Number(p.sellingPrice) * p.currentStock, 0);
    return {
      totalCost: cost,
      totalRetail: retail,
      potentialProfit: retail - cost,
      units: products.reduce((acc, p) => acc + p.currentStock, 0),
      productCount: products.length,
    };
  }

  async summaries() {
    const [lowStock, outOfStock, movements] = await Promise.all([
      this.prisma.product.count({ where: { status: 'ACTIVE', currentStock: { gt: 0 } } }),
      this.prisma.product.count({ where: { status: 'ACTIVE', currentStock: 0 } }),
      this.prisma.stockMovement.count(),
    ]);
    return { productsAboveZero: lowStock, outOfStock, movements };
  }
}
