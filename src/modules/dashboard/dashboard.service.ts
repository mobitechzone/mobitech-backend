import { Injectable } from '@nestjs/common';
import { Prisma, RepairStatus, SaleStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  startOfToday,
  endOfToday,
  startOfMonth,
  daysAgo,
  startOfWeek,
  startOfYear,
} from '../../common/utils/date.utils';
import { toNumber } from '../../common/utils/number.utils';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const todayStart = startOfToday();
    const todayEnd = endOfToday();
    const monthStart = startOfMonth();
    const weekStart = startOfWeek();
    const yearStart = startOfYear();

    const [
      todaySales,
      todayRepairs,
      todayExpenses,
      monthSales,
      monthRepairs,
      monthExpenses,
      weekSales,
      yearSales,
      pendingRepairs,
      lowStock,
    ] = await Promise.all([
      this.prisma.sale.aggregate({
        where: { createdAt: { gte: todayStart, lte: todayEnd }, status: SaleStatus.COMPLETED },
        _sum: { total: true, profit: true, cost: true },
        _count: true,
      }),
      this.prisma.repair.aggregate({
        where: { dateReceived: { gte: todayStart, lte: todayEnd } },
        _count: true,
        _sum: { totalCost: true, profit: true },
      }),
      this.prisma.expense.aggregate({
        where: { date: { gte: todayStart, lte: todayEnd } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.sale.aggregate({
        where: { createdAt: { gte: monthStart, lte: todayEnd }, status: SaleStatus.COMPLETED },
        _sum: { total: true, profit: true, cost: true },
        _count: true,
      }),
      this.prisma.repair.aggregate({
        where: { dateReceived: { gte: monthStart, lte: todayEnd } },
        _count: true,
        _sum: { totalCost: true, profit: true },
      }),
      this.prisma.expense.aggregate({
        where: { date: { gte: monthStart, lte: todayEnd } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.sale.aggregate({
        where: { createdAt: { gte: weekStart, lte: todayEnd }, status: SaleStatus.COMPLETED },
        _sum: { total: true, profit: true },
      }),
      this.prisma.sale.aggregate({
        where: { createdAt: { gte: yearStart, lte: todayEnd }, status: SaleStatus.COMPLETED },
        _sum: { total: true, profit: true },
      }),
      this.prisma.repair.findMany({
        where: { status: { in: [RepairStatus.RECEIVED, RepairStatus.DIAGNOSING, RepairStatus.WAITING_FOR_PARTS, RepairStatus.IN_PROGRESS] } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.product.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { currentStock: 'asc' },
        take: 10,
        include: { category: true },
      }),
    ]);

    const monthExpenseTotal = toNumber(monthExpenses._sum.amount);
    const monthRepairRevenue = toNumber(monthRepairs._sum.totalCost);
    const monthRepairProfit = toNumber(monthRepairs._sum.profit);
    const todaySalesTotal = toNumber(todaySales._sum.total);
    const todaySalesProfit = toNumber(todaySales._sum.profit);
    const todayRepairsTotal = toNumber(todayRepairs._sum.totalCost);
    const todayRepairsProfit = toNumber(todayRepairs._sum.profit);
    const todayExpenseTotal = toNumber(todayExpenses._sum.amount);
    const monthSalesTotal = toNumber(monthSales._sum.total);
    const monthSalesProfit = toNumber(monthSales._sum.profit);
    const monthSalesCost = toNumber(monthSales._sum.cost);

    return {
      today: {
        sales: todaySales._count ?? 0,
        salesRevenue: todaySalesTotal,
        salesProfit: todaySalesProfit,
        repairs: todayRepairs._count ?? 0,
        repairRevenue: todayRepairsTotal,
        repairProfit: todayRepairsProfit,
        expenses: todayExpenses._count ?? 0,
        expenseTotal: todayExpenseTotal,
        totalRevenue: todaySalesTotal + todayRepairsTotal,
        totalProfit: todaySalesProfit + todayRepairsProfit - todayExpenseTotal,
      },
      week: {
        revenue: toNumber(weekSales._sum.total),
        profit: toNumber(weekSales._sum.profit),
      },
      month: {
        sales: monthSales._count ?? 0,
        salesRevenue: monthSalesTotal,
        salesProfit: monthSalesProfit,
        salesCost: monthSalesCost,
        repairs: monthRepairs._count ?? 0,
        repairRevenue: monthRepairRevenue,
        repairProfit: monthRepairProfit,
        expenses: monthExpenseTotal,
        totalRevenue: monthSalesTotal + monthRepairRevenue,
        grossProfit: monthSalesProfit + monthRepairProfit,
        netProfit: monthSalesProfit + monthRepairProfit - monthExpenseTotal,
        margin: monthSalesTotal > 0 ? ((monthSalesProfit + monthRepairProfit) / (monthSalesTotal + monthRepairRevenue)) * 100 : 0,
      },
      year: {
        revenue: toNumber(yearSales._sum.total),
        profit: toNumber(yearSales._sum.profit),
      },
      pendingRepairs,
      lowStock: lowStock.filter((p) => Number(p.currentStock) <= Number(p.minStock)),
      lowStockCount: lowStock.filter((p) => Number(p.currentStock) <= Number(p.minStock)).length,
      outOfStockCount: lowStock.filter((p) => p.currentStock === 0).length,
    };
  }

  async charts() {
    const todayEnd = endOfToday();
    const monthStart = startOfMonth();
    const thirtyDaysAgo = daysAgo(30);

    const [sales30, repairs30, topItems, recentSales, recentRepairs, monthRevenue] = await Promise.all([
      this.prisma.sale.findMany({
        where: { createdAt: { gte: thirtyDaysAgo, lte: todayEnd }, status: SaleStatus.COMPLETED },
        select: { createdAt: true, total: true, profit: true },
      }),
      this.prisma.repair.findMany({
        where: { dateReceived: { gte: thirtyDaysAgo, lte: todayEnd } },
        select: { createdAt: true, dateReceived: true, totalCost: true, profit: true, status: true },
      }),
      this.prisma.saleItem.findMany({
        where: { sale: { createdAt: { gte: thirtyDaysAgo, lte: todayEnd }, status: SaleStatus.COMPLETED } },
        select: { productName: true, quantity: true, lineTotal: true, product: { select: { id: true } } },
      }),
      this.prisma.sale.findMany({
        where: { createdAt: { gte: thirtyDaysAgo, lte: todayEnd } },
        include: {
          customer: { select: { name: true } },
          employee: { select: { name: true } },
          items: true,
          payments: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      this.prisma.repair.findMany({
        where: { dateReceived: { gte: thirtyDaysAgo, lte: todayEnd } },
        include: { customer: { select: { name: true } }, technician: { select: { name: true } }, parts: true, payments: true },
        orderBy: { createdAt: 'desc' },
        take: 8,
      }),
      this.prisma.sale.aggregate({
        where: { createdAt: { gte: monthStart, lte: todayEnd }, status: SaleStatus.COMPLETED },
        _sum: { total: true, profit: true },
      }),
    ]);

    const salesEvolution = this.groupByDay(sales30, (s) => s.createdAt);
    const repairsEvolution = this.groupByDay(repairs30, (r) => r.dateReceived ?? r.createdAt);

    const topProducts = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const item of topItems) {
      const entry = topProducts.get(item.productName) ?? { name: item.productName, quantity: 0, revenue: 0 };
      entry.quantity += item.quantity;
      entry.revenue += Number(item.lineTotal);
      topProducts.set(item.productName, entry);
    }

    const revenueByDay = this.groupByDaySum(sales30, (s) => s.createdAt, (s) => Number(s.total));
    const profitByDay = this.groupByDaySum(sales30, (s) => s.createdAt, (s) => Number(s.profit));
    const revenueVsProfit = Object.keys(revenueByDay).map((day) => ({
      day,
      revenue: revenueByDay[day],
      profit: profitByDay[day] ?? 0,
    }));

    const repairsByStatus = {
      received: repairs30.filter((r) => r.status === RepairStatus.RECEIVED).length,
      diagnosing: repairs30.filter((r) => r.status === RepairStatus.DIAGNOSING).length,
      waitingForParts: repairs30.filter((r) => r.status === RepairStatus.WAITING_FOR_PARTS).length,
      inProgress: repairs30.filter((r) => r.status === RepairStatus.IN_PROGRESS).length,
      ready: repairs30.filter((r) => r.status === RepairStatus.READY).length,
      delivered: repairs30.filter((r) => r.status === RepairStatus.DELIVERED).length,
      cancelled: repairs30.filter((r) => r.status === RepairStatus.CANCELLED).length,
    };

    return {
      salesEvolution,
      repairsEvolution,
      topProducts: [...topProducts.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 8),
      revenueVsProfit,
      repairsByStatus,
      monthlyRevenue: toNumber(monthRevenue._sum.total),
      monthlyProfit: toNumber(monthRevenue._sum.profit),
      recentSales,
      recentRepairs,
    };
  }

  private groupByDay<T>(items: T[], keyFn: (item: T) => Date): { day: string; count: number }[] {
    const map = new Map<string, number>();
    for (const item of items) {
      const day = new Date(keyFn(item)).toISOString().slice(0, 10);
      map.set(day, (map.get(day) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, count]) => ({ day, count }));
  }

  private groupByDaySum<T>(items: T[], keyFn: (item: T) => Date, valFn: (item: T) => number): Record<string, number> {
    const map: Record<string, number> = {};
    for (const item of items) {
      const day = new Date(keyFn(item)).toISOString().slice(0, 10);
      map[day] = (map[day] ?? 0) + valFn(item);
    }
    return map;
  }
}
