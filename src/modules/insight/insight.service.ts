import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class InsightService {
  private readonly logger = new Logger(InsightService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      totalProducts,
      totalCustomers,
      totalRepairs,
      totalSales,
      todaySales,
      monthSales,
      lastMonthSales,
      monthRepairs,
      monthExpenses,
      lowStock,
      outOfStock,
      pendingRepairs,
      overdueRepairs,
      totalRevenue,
      monthRevenue,
      monthProfit,
      unpaidBalance,
    ] = await this.prisma.$transaction([
      this.prisma.product.count(),
      this.prisma.customer.count(),
      this.prisma.repair.count(),
      this.prisma.sale.count(),
      this.prisma.sale.count({ where: { createdAt: { gte: today } } }),
      this.prisma.sale.count({ where: { createdAt: { gte: thisMonth } } }),
      this.prisma.sale.count({ where: { createdAt: { gte: lastMonth, lt: thisMonth } } }),
      this.prisma.repair.count({ where: { createdAt: { gte: thisMonth } } }),
      this.prisma.expense.aggregate({ _sum: { amount: true }, where: { date: { gte: thisMonth } } }),
      this.prisma.product.count({ where: { currentStock: { lte: 5, gt: 0 } } }),
      this.prisma.product.count({ where: { currentStock: 0 } }),
      this.prisma.repair.count({ where: { status: { in: ['RECEIVED', 'DIAGNOSING', 'WAITING_FOR_PARTS', 'IN_PROGRESS'] } } }),
      this.prisma.repair.count({ where: { estimatedFinish: { lt: now }, status: { in: ['RECEIVED', 'DIAGNOSING', 'WAITING_FOR_PARTS', 'IN_PROGRESS'] } } }),
      this.prisma.sale.aggregate({ _sum: { total: true } }),
      this.prisma.sale.aggregate({ _sum: { total: true }, where: { createdAt: { gte: thisMonth } } }),
      this.prisma.sale.aggregate({ _sum: { profit: true }, where: { createdAt: { gte: thisMonth } } }),
      this.prisma.repair.aggregate({ _sum: { remainingBalance: true }, where: { remainingBalance: { gt: 0 } } }),
    ]);

    return {
      totalProducts,
      totalCustomers,
      totalRepairs,
      totalSales,
      todaySales,
      monthSales,
      lastMonthSales,
      monthRepairs,
      monthExpenses: monthExpenses._sum.amount ?? 0,
      lowStock,
      outOfStock,
      pendingRepairs,
      overdueRepairs,
      totalRevenue: totalRevenue._sum.total ?? 0,
      monthRevenue: monthRevenue._sum.total ?? 0,
      monthProfit: monthProfit._sum.profit ?? 0,
      unpaidBalance: unpaidBalance._sum.remainingBalance ?? 0,
    };
  }

  async getSalesHeatmap() {
    const sales = await this.prisma.sale.findMany({
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const heatmap: Record<string, number> = {};
    sales.forEach((s) => {
      const d = new Date(s.createdAt);
      const day = d.getDay();
      const hour = d.getHours();
      const key = `${day}-${hour}`;
      heatmap[key] = (heatmap[key] || 0) + 1;
    });

    return heatmap;
  }

  async getRepairHeatmap() {
    const repairs = await this.prisma.repairTimeline.findMany({
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const heatmap: Record<string, number> = {};
    repairs.forEach((r) => {
      const d = new Date(r.createdAt);
      const day = d.getDay();
      const hour = d.getHours();
      const key = `${day}-${hour}`;
      heatmap[key] = (heatmap[key] || 0) + 1;
    });

    return heatmap;
  }

  async getSalesTrend(days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const sales = await this.prisma.sale.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, total: true, profit: true },
      orderBy: { createdAt: 'asc' },
    });

    const daily: Record<string, { revenue: number; profit: number; count: number }> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split('T')[0];
      daily[key] = { revenue: 0, profit: 0, count: 0 };
    }

    sales.forEach((s) => {
      const key = new Date(s.createdAt).toISOString().split('T')[0];
      if (daily[key]) {
        daily[key].revenue += Number(s.total);
        daily[key].profit += Number(s.profit);
        daily[key].count += 1;
      }
    });

    return Object.entries(daily).map(([date, data]) => ({ date, ...data }));
  }

  async getRepairTrend(days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const repairs = await this.prisma.repair.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, status: true, totalCost: true },
      orderBy: { createdAt: 'asc' },
    });

    const daily: Record<string, { created: number; revenue: number; statuses: Record<string, number> }> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split('T')[0];
      daily[key] = { created: 0, revenue: 0, statuses: {} };
    }

    repairs.forEach((r) => {
      const key = new Date(r.createdAt).toISOString().split('T')[0];
      if (daily[key]) {
        daily[key].created += 1;
        daily[key].revenue += Number(r.totalCost);
        daily[key].statuses[r.status] = (daily[key].statuses[r.status] || 0) + 1;
      }
    });

    return Object.entries(daily).map(([date, data]) => ({ date, ...data }));
  }

  async getTopProducts(limit = 10) {
    const products = await this.prisma.product.findMany({
      select: { id: true, name: true, currentStock: true, sellingPrice: true },
      orderBy: { currentStock: 'desc' },
      take: limit,
    });
    return products;
  }

  async getTopCustomers(limit = 10) {
    const customers = await this.prisma.customer.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        _count: { select: { sales: true, repairs: true } },
        sales: { select: { total: true } },
      },
      orderBy: { sales: { _count: 'desc' } },
      take: limit,
    });

    return customers.map((c) => ({
      ...c,
      totalSpent: c.sales.reduce((sum, s) => sum + Number(s.total), 0),
      salesCount: c._count.sales,
      repairsCount: c._count.repairs,
      sales: undefined,
      _count: undefined,
    }));
  }

  async getCategoryBreakdown() {
    const categories = await this.prisma.category.findMany({
      select: {
        id: true,
        name: true,
        _count: { select: { products: true } },
      },
      orderBy: { products: { _count: 'desc' } },
    });
    return categories;
  }

  async getPaymentMethodBreakdown() {
    const methods = await this.prisma.payment.groupBy({
      by: ['method'],
      _sum: { amount: true },
      _count: true,
      orderBy: { _sum: { amount: 'desc' } },
    });
    return methods;
  }

  async getRepairStatusBreakdown() {
    const statuses = await this.prisma.repair.groupBy({
      by: ['status'],
      _count: true,
    });
    return statuses;
  }

  async getAnomalies() {
    const alerts: { type: string; severity: string; title: string; message: string }[] = [];

    const lowStockProducts = await this.prisma.product.findMany({
      where: { currentStock: { lte: 3 }, infiniteStock: false },
      select: { name: true, currentStock: true },
    });
    lowStockProducts.forEach((p) => {
      alerts.push({
        type: 'LOW_STOCK',
        severity: p.currentStock === 0 ? 'critical' : 'warning',
        title: `Low stock: ${p.name}`,
        message: `${p.name} has only ${p.currentStock} units left`,
      });
    });

    const overdueRepairs = await this.prisma.repair.findMany({
      where: {
        estimatedFinish: { lt: new Date() },
        status: { in: ['RECEIVED', 'DIAGNOSING', 'WAITING_FOR_PARTS', 'IN_PROGRESS'] },
      },
      select: { repairNumber: true, estimatedFinish: true, customerName: true },
    });
    overdueRepairs.forEach((r) => {
      if (!r.estimatedFinish) return;
      const days = Math.floor((Date.now() - new Date(r.estimatedFinish).getTime()) / 86400000);
      alerts.push({
        type: 'OVERDUE_REPAIR',
        severity: days > 7 ? 'critical' : 'warning',
        title: `Overdue: ${r.repairNumber}`,
        message: `${r.customerName}'s repair is ${days} day(s) overdue`,
      });
    });

    const highUnpaid = await this.prisma.repair.findMany({
      where: { remainingBalance: { gt: 100 } },
      select: { repairNumber: true, remainingBalance: true, customerName: true },
      orderBy: { remainingBalance: 'desc' },
      take: 5,
    });
    highUnpaid.forEach((r) => {
      alerts.push({
        type: 'HIGH_BALANCE',
        severity: 'info',
        title: `Unpaid: ${r.repairNumber}`,
        message: `${r.customerName} owes ${Number(r.remainingBalance).toFixed(3)} TND`,
      });
    });

    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [thisMonthRevenue, lastMonthRevenue] = await this.prisma.$transaction([
      this.prisma.sale.aggregate({ _sum: { total: true }, where: { createdAt: { gte: thisMonth } } }),
      this.prisma.sale.aggregate({ _sum: { total: true }, where: { createdAt: { gte: lastMonth, lt: thisMonth } } }),
    ]);

    const thisRev = Number(thisMonthRevenue._sum.total ?? 0);
    const lastRev = Number(lastMonthRevenue._sum.total ?? 0);
    if (lastRev > 0 && thisRev < lastRev * 0.5) {
      alerts.push({
        type: 'REVENUE_DROP',
        severity: 'critical',
        title: 'Revenue drop detected',
        message: `This month's revenue (${thisRev.toFixed(0)} TND) is ${((1 - thisRev / lastRev) * 100).toFixed(0)}% lower than last month`,
      });
    }

    return alerts;
  }

  async getDailyRevenueComparison() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);

    const [todayData, yesterdayData] = await this.prisma.$transaction([
      this.prisma.sale.aggregate({
        _sum: { total: true },
        _count: true,
        where: { createdAt: { gte: today } },
      }),
      this.prisma.sale.aggregate({
        _sum: { total: true },
        _count: true,
        where: { createdAt: { gte: yesterday, lt: today } },
      }),
    ]);

    return {
      today: { revenue: Number(todayData._sum.total ?? 0), count: todayData._count },
      yesterday: { revenue: Number(yesterdayData._sum.total ?? 0), count: yesterdayData._count },
    };
  }
}
