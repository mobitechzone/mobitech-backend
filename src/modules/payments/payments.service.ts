import { Injectable } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { toNumber } from '../../common/utils/number.utils';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: {
    page?: number;
    limit?: number;
    method?: PaymentMethod;
    type?: 'SALE' | 'REPAIR';
    startDate?: Date;
    endDate?: Date;
    search?: string;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const paymentWhere: Prisma.PaymentWhereInput = {
      ...(query.method ? { method: query.method } : {}),
      ...(query.startDate || query.endDate
        ? { createdAt: { ...(query.startDate ? { gte: query.startDate } : {}), ...(query.endDate ? { lte: query.endDate } : {}) } }
        : {}),
    };

    const repairPaymentWhere: Prisma.RepairPaymentWhereInput = {
      ...(query.method ? { method: query.method } : {}),
      ...(query.startDate || query.endDate
        ? { createdAt: { ...(query.startDate ? { gte: query.startDate } : {}), ...(query.endDate ? { lte: query.endDate } : {}) } }
        : {}),
    };

    const salePayments = query.type === 'REPAIR' ? [] : await this.prisma.payment.findMany({
      where: paymentWhere,
      include: {
        sale: { select: { id: true, invoiceNumber: true, total: true, status: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const repairPayments = query.type === 'SALE' ? [] : await this.prisma.repairPayment.findMany({
      where: repairPaymentWhere,
      include: {
        repair: { select: { id: true, repairNumber: true, customerName: true, totalCost: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const combined = [
      ...salePayments.map((p) => ({
        id: p.id,
        kind: 'SALE' as const,
        reference: p.sale?.invoiceNumber ?? null,
        amount: Number(p.amount),
        method: p.method,
        user: p.user,
        createdAt: p.createdAt,
        meta: p.sale,
      })),
      ...repairPayments.map((p) => ({
        id: p.id,
        kind: 'REPAIR' as const,
        reference: p.repair?.repairNumber ?? null,
        amount: Number(p.amount),
        method: p.method,
        user: p.user,
        createdAt: p.createdAt,
        meta: p.repair,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const filtered = query.search
      ? combined.filter((c) => c.reference?.toLowerCase().includes(query.search!.toLowerCase()))
      : combined;

    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);

    const total = filtered.length;
    const totalAmount = filtered.reduce((acc, p) => acc + p.amount, 0);

    return {
      items,
      total,
      totalAmount,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async dailySummary(startDate: Date, endDate: Date) {
    const [sales, repairs] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { createdAt: { gte: startDate, lte: endDate } },
        _sum: { amount: true },
      }),
      this.prisma.repairPayment.aggregate({
        where: { createdAt: { gte: startDate, lte: endDate } },
        _sum: { amount: true },
      }),
    ]);
    return {
      salePayments: toNumber(sales._sum.amount),
      repairPayments: toNumber(repairs._sum.amount),
      total: toNumber(sales._sum.amount) + toNumber(repairs._sum.amount),
    };
  }
}
