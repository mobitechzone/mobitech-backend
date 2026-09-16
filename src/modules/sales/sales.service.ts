import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma, User, Role, SaleStatus, PaymentMethod, StockMovementType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSaleDto, RefundSaleDto, HoldSaleDto, QuerySaleDto } from './dto/sales.dto';
import { AuditService } from '../audit/audit.service';
import { CustomersService } from '../customers/customers.service';
import { toNumber, round2, round3 } from '../../common/utils/number.utils';

const saleInclude = {
  items: true,
  payments: true,
  customer: { select: { id: true, name: true, phone: true, loyaltyPoints: true } },
  employee: { select: { id: true, name: true } },
} satisfies Prisma.SaleInclude;

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly customersService: CustomersService,
  ) {}

  async nextInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const last = await this.prisma.sale.findFirst({ orderBy: { createdAt: 'desc' } });
    let seq = 1;
    if (last && last.invoiceNumber) {
      const match = last.invoiceNumber.match(/(\d+)$/);
      if (match) seq = parseInt(match[1], 10) + 1;
    }
    const base = `INV-${year}-`;
    let number = `${base}${String(seq).padStart(6, '0')}`;
    let exists = await this.prisma.sale.findUnique({ where: { invoiceNumber: number } });
    while (exists) {
      seq += 1;
      number = `${base}${String(seq).padStart(6, '0')}`;
      exists = await this.prisma.sale.findUnique({ where: { invoiceNumber: number } });
    }
    return number;
  }

  async create(dto: CreateSaleDto, actor: User, ip?: string) {
    const productIds = dto.items.filter((i) => i.productId).map((i) => i.productId as string);
    const products = productIds.length
      ? await this.prisma.product.findMany({ where: { id: { in: productIds } } })
      : [];
    const productMap = new Map(products.map((p) => [p.id, p]));

    for (const item of dto.items) {
      if (item.productId) {
        const product = productMap.get(item.productId);
        if (!product) throw new BadRequestException(`Product "${item.name}" was not found`);
        if (!product.infiniteStock && product.currentStock < item.quantity) {
          throw new BadRequestException(`Insufficient stock for "${product.name}". Only ${product.currentStock} available.`);
        }
        const minSellingPrice = toNumber(product.minSellingPrice, 0);
        if (minSellingPrice > 0) {
          const itemDiscount = item.discount ?? 0;
          const effectiveUnitPrice = item.unitPrice - itemDiscount / item.quantity;
          if (effectiveUnitPrice < minSellingPrice - 0.001) {
            throw new BadRequestException(
              `Selling price for "${product.name}" (${effectiveUnitPrice.toFixed(3)}) cannot be lower than minimum allowed selling price (${minSellingPrice.toFixed(3)})`
            );
          }
        }
      }
    }

    let subtotal = 0;
    let totalDiscount = 0;
    let totalCost = 0;
    const isCustomPriceUsed = dto.useCustomPrice === true;

    if (isCustomPriceUsed && !this.canCustomPrice(actor)) {
      throw new ForbiddenException('You do not have permission to apply custom prices');
    }

    const items = dto.items.map((item) => {
      const product = item.productId ? productMap.get(item.productId) : undefined;
      const unitCost = item.unitCost ?? toNumber(product?.buyingPrice, 0);
      const unitPrice = item.unitPrice;
      const itemDiscount = item.discount ?? 0;
      const lineTotal = round3(unitPrice * item.quantity - itemDiscount);
      const cost = round3(unitCost * item.quantity);
      subtotal = round3(subtotal + unitPrice * item.quantity);
      totalDiscount = round3(totalDiscount + itemDiscount);
      totalCost = round3(totalCost + cost);
      return {
        productId: product?.id ?? null,
        productName: item.name,
        barcode: item.barcode ?? product?.barcode ?? null,
        sku: item.sku ?? product?.sku ?? null,
        quantity: item.quantity,
        unitCost,
        unitPrice,
        discount: itemDiscount,
        lineTotal,
        cost,
      };
    });

    const orderDiscountRaw = dto.discount ?? 0;
    const discountType = dto.discountType ?? 'FIXED';
    const orderDiscount =
      discountType === 'PERCENT' ? round2((subtotal / 100) * orderDiscountRaw) : round2(orderDiscountRaw);

    const discountApplied = Math.min(orderDiscount, Math.max(subtotal - totalDiscount, 0));
    totalDiscount = round3(totalDiscount + discountApplied);

    const taxRate = dto.taxRate ?? 0;
    const taxableBase = Math.max(subtotal - totalDiscount, 0);
    const tax = round3((taxableBase / 100) * taxRate);
    const total = round3(taxableBase + tax);
    const profit = round3(totalCost > 0 ? total - tax - totalCost : subtotal - totalDiscount - totalCost);

    const payments = dto.payments;
    const paid = round3(payments.reduce((acc, p) => acc + p.amount, 0));
    if (Math.abs(paid - total) > 0.01 && payments.length === 1) {
      throw new BadRequestException(`Payment amount (${paid}) does not match the total (${total})`);
    }
    if (paid > total + 0.01) {
      throw new BadRequestException('Payment exceeds the sale total');
    }
    const received = dto.received ?? paid;
    const changeGiven = Math.max(round3(received - total), 0);
    const primaryMethod = payments[0].method;

    const invoiceNumber = await this.nextInvoiceNumber();

    const activeSession = await this.prisma.cashSession.findFirst({
      where: { openedById: actor.id, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });

    const sale = await this.prisma.$transaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          invoiceNumber,
          customerId: dto.customerId || null,
          employeeId: actor.id,
          cashSessionId: activeSession?.id || null,
          subtotal,
          discount: totalDiscount,
          discountType,
          tax,
          taxRate,
          total,
          cost: totalCost,
          profit,
          paid,
          changeGiven,
          paymentMethod: primaryMethod,
          notes: dto.notes,
          items: { create: items },
          payments: {
            create: payments.map((p) => ({
              method: p.method,
              amount: p.amount,
              userId: actor.id,
            })),
          },
        },
        include: saleInclude,
      });

      if (activeSession) {
        const cashAmount = payments
          .filter((p) => p.method === PaymentMethod.CASH)
          .reduce((sum, p) => sum + p.amount, 0);
        if (cashAmount > 0 || changeGiven > 0) {
          await tx.cashSession.update({
            where: { id: activeSession.id },
            data: {
              cashSales: { increment: cashAmount },
              changeGiven: { increment: changeGiven },
            },
          });
        }
      }

      for (const item of dto.items) {
        if (!item.productId) continue;
        const product = productMap.get(item.productId)!;
        if (product.infiniteStock) continue;
        await tx.product.update({
          where: { id: product.id },
          data: {
            currentStock: { decrement: item.quantity },
            stockMovements: {
              create: {
                type: StockMovementType.SALE,
                quantity: item.quantity,
                beforeStock: product.currentStock,
                afterStock: product.currentStock - item.quantity,
                reference: invoiceNumber,
                userId: actor.id,
              },
            },
          },
        });
      }

      if (dto.customerId) {
        await tx.customer.update({
          where: { id: dto.customerId },
          data: { loyaltyPoints: { increment: Math.round(total / 10) } },
        });
      }

      return created;
    });

    await this.audit.log({
      action: 'CREATE',
      entity: 'SALE',
      entityId: sale.id,
      userId: actor.id,
      details: { invoiceNumber, total, items: dto.items.length },
      ipAddress: ip,
    });

    return sale;
  }

  async findAll(query: QuerySaleDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.SaleWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.startDate || query.endDate
        ? { createdAt: { ...(query.startDate ? { gte: query.startDate } : {}), ...(query.endDate ? { lte: query.endDate } : {}) } }
        : {}),
      ...(query.productId ? { items: { some: { productId: query.productId } } } : {}),
      ...(query.search
        ? {
            OR: [
              { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
              { customer: { name: { contains: query.search, mode: 'insensitive' } } },
              { customer: { phone: { contains: query.search, mode: 'insensitive' } } },
              { employee: { name: { contains: query.search, mode: 'insensitive' } } },
              { items: { some: { OR: [{ productName: { contains: query.search, mode: 'insensitive' } }, { barcode: { contains: query.search, mode: 'insensitive' } }] } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        include: saleInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.sale.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const sale = await this.prisma.sale.findUnique({ where: { id }, include: saleInclude });
    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
  }

  async findByInvoice(invoiceNumber: string) {
    const sale = await this.prisma.sale.findUnique({ where: { invoiceNumber }, include: saleInclude });
    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
  }

  async refund(id: string, dto: RefundSaleDto, actor: User, ip?: string) {
    if (actor.role !== Role.ADMIN && !(actor as any).permissions?.canRefund) {
      throw new ForbiddenException('You do not have permission to refund sales');
    }
    const sale = await this.prisma.sale.findUnique({ where: { id }, include: { items: true } });
    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.status !== 'COMPLETED') {
      throw new BadRequestException('Only completed sales can be refunded');
    }

    const refunded = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.sale.update({
        where: { id },
        data: {
          status: SaleStatus.REFUNDED,
          refundedAt: new Date(),
          refundReason: dto.reason,
          refundedBy: actor.id,
        },
        include: saleInclude,
      });

      for (const item of sale.items) {
        if (!item.productId) continue;
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) continue;
        if (product.infiniteStock) continue;
        await tx.product.update({
          where: { id: item.productId },
          data: {
            currentStock: { increment: item.quantity },
            stockMovements: {
              create: {
                type: StockMovementType.RETURN,
                quantity: item.quantity,
                beforeStock: product.currentStock,
                afterStock: product.currentStock + item.quantity,
                reference: sale.invoiceNumber,
                notes: `Refund: ${dto.reason}`,
                userId: actor.id,
              },
            },
          },
        });
      }
      return updated;
    });

    await this.audit.log({
      action: 'REFUND',
      entity: 'SALE',
      entityId: id,
      userId: actor.id,
      details: { invoiceNumber: sale.invoiceNumber, reason: dto.reason, total: sale.total.toString() },
      ipAddress: ip,
    });

    return refunded;
  }

  async cancel(id: string, actor: User, ip?: string) {
    if (actor.role !== Role.ADMIN && !(actor as any).permissions?.canDeleteSale) {
      throw new ForbiddenException('You do not have permission to cancel sales');
    }
    const sale = await this.prisma.sale.findUnique({ where: { id }, include: { items: true } });
    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.status !== 'COMPLETED') {
      throw new BadRequestException('Only completed sales can be cancelled');
    }

    const cancelled = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.sale.update({
        where: { id },
        data: { status: SaleStatus.CANCELLED },
        include: saleInclude,
      });
      for (const item of sale.items) {
        if (!item.productId) continue;
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) continue;
        if (product.infiniteStock) continue;
        await tx.product.update({
          where: { id: item.productId },
          data: {
            currentStock: { increment: item.quantity },
            stockMovements: {
              create: {
                type: StockMovementType.RETURN,
                quantity: item.quantity,
                beforeStock: product.currentStock,
                afterStock: product.currentStock + item.quantity,
                reference: sale.invoiceNumber,
                notes: 'Sale cancelled',
                userId: actor.id,
              },
            },
          },
        });
      }
      return updated;
    });

    await this.audit.log({ action: 'DELETE', entity: 'SALE', entityId: id, userId: actor.id, details: { invoiceNumber: sale.invoiceNumber }, ipAddress: ip });
    return cancelled;
  }

  // ===== Held sales =====

  async hold(dto: HoldSaleDto, actor: User) {
    if (actor.role !== Role.ADMIN && !(actor as any).permissions?.canHoldSale) {
      throw new ForbiddenException('You do not have permission to hold sales');
    }
    const reference = `HLD-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const held = await this.prisma.heldSale.create({
      data: {
        reference,
        employeeId: actor.id,
        customerId: dto.customerId || null,
        items: dto.items as unknown as Prisma.InputJsonValue,
        discount: dto.discount ?? 0,
        discountType: dto.discountType ?? 'FIXED',
        note: dto.note,
      },
    });
    return held;
  }

  async listHeld(query: { page?: number; limit?: number }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.heldSale.findMany({
        include: { employee: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.heldSale.count(),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async resumeHeld(id: string, actor: User) {
    const held = await this.prisma.heldSale.findUnique({ where: { id } });
    if (!held) throw new NotFoundException('Held sale not found');
    await this.prisma.heldSale.delete({ where: { id } });
    return { ...held, resumedBy: actor.id };
  }

  async discardHeld(id: string) {
    const held = await this.prisma.heldSale.findUnique({ where: { id } });
    if (!held) throw new NotFoundException('Held sale not found');
    await this.prisma.heldSale.delete({ where: { id } });
    return { message: 'Held sale discarded' };
  }

  private canCustomPrice(actor: User): boolean {
    return actor.role === Role.ADMIN || (actor as any).permissions?.canCustomPrice === true;
  }
}
