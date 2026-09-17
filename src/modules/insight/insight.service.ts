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

  async getTransactionStats() {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last30 = new Date(Date.now() - 30 * 86400000);
    const prev30 = new Date(Date.now() - 60 * 86400000);

    const [monthData, lastMonthData, last30Data, prev30Data] = await this.prisma.$transaction([
      this.prisma.sale.aggregate({ _sum: { total: true }, _count: true, where: { createdAt: { gte: thisMonth } } }),
      this.prisma.sale.aggregate({ _sum: { total: true }, _count: true, where: { createdAt: { gte: lastMonth, lt: thisMonth } } }),
      this.prisma.sale.aggregate({ _sum: { total: true }, _count: true, where: { createdAt: { gte: last30 } } }),
      this.prisma.sale.aggregate({ _sum: { total: true }, _count: true, where: { createdAt: { gte: prev30, lt: last30 } } }),
    ]);

    const monthRevenue = Number(monthData._sum.total ?? 0);
    const monthCount = monthData._count;
    const lastMonthRevenue = Number(lastMonthData._sum.total ?? 0);
    const lastMonthCount = lastMonthData._count;
    const last30Revenue = Number(last30Data._sum.total ?? 0);
    const last30Count = last30Data._count;
    const prev30Revenue = Number(prev30Data._sum.total ?? 0);
    const prev30Count = prev30Data._count;

    return {
      totalTransactionsMonth: monthCount,
      avgOrderValueMonth: monthCount > 0 ? monthRevenue / monthCount : 0,
      salesGrowthMonth: lastMonthRevenue > 0 ? ((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : 0,
      totalTransactions30d: last30Count,
      avgOrderValue30d: last30Count > 0 ? last30Revenue / last30Count : 0,
      salesGrowth30d: prev30Revenue > 0 ? ((last30Revenue - prev30Revenue) / prev30Revenue) * 100 : 0,
      monthRevenue,
      lastMonthRevenue,
      last30Revenue,
      prev30Revenue,
    };
  }

  async getAdvancedAnalytics() {
    const sales = await this.prisma.sale.findMany({
      select: { createdAt: true, total: true, profit: true, items: { select: { productId: true, quantity: true, unitPrice: true, lineTotal: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const daily: Record<string, { revenue: number; count: number; profit: number }> = {};
    sales.forEach((s) => {
      const key = new Date(s.createdAt).toISOString().split('T')[0];
      if (!daily[key]) daily[key] = { revenue: 0, count: 0, profit: 0 };
      daily[key].revenue += Number(s.total);
      daily[key].count += 1;
      daily[key].profit += Number(s.profit);
    });

    const dates = Object.keys(daily).sort();
    const revenues = dates.map((d) => daily[d].revenue);
    const counts = dates.map((d) => daily[d].count);

    const movingAvg7 = this.movingAverage(revenues, 7);
    const weightedMA = this.weightedMovingAverage(revenues, 7);
    const ema = this.exponentialMovingAverage(revenues, 0.3);
    const linearReg = this.linearRegression(revenues);

    const productSales: Record<string, number> = {};
    sales.forEach((s) => {
      s.items.forEach((item) => {
        if (!item.productId) return;
        productSales[item.productId] = (productSales[item.productId] || 0) + Number(item.lineTotal);
      });
    });
    const totalProductSales = Object.values(productSales).reduce((a, b) => a + b, 0);
    const abcAnalysis = this.abcAnalysis(productSales, totalProductSales);

    const correlation = this.correlation(revenues, counts);
    const stdDev = this.standardDeviation(revenues);
    const zScores = this.zScores(revenues);

    const productPrices: Record<string, { total: number; count: number }> = {};
    sales.forEach((s) => {
      s.items.forEach((item) => {
        if (!item.productId) return;
        if (!productPrices[item.productId]) productPrices[item.productId] = { total: 0, count: 0 };
        productPrices[item.productId].total += Number(item.unitPrice) * Number(item.quantity);
        productPrices[item.productId].count += Number(item.quantity);
      });
    });

    const coOccurrence: Record<string, number> = {};
    const customerProducts: Record<string, Set<string>> = {};
    sales.forEach((s) => {
      const pids = s.items.map((i) => i.productId).filter(Boolean) as string[];
      pids.forEach((pid) => {
        if (!customerProducts[pid]) customerProducts[pid] = new Set();
        pids.forEach((other) => {
          if (pid !== other) customerProducts[pid].add(other);
        });
      });
    });
    Object.entries(customerProducts).forEach(([product, related]) => {
      related.forEach((r) => {
        const key = [product, r].sort().join('|||');
        coOccurrence[key] = (coOccurrence[key] || 0) + 1;
      });
    });
    const topRules = Object.entries(coOccurrence)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([key, count]) => {
        const [a, b] = key.split('|||');
        return { productA: a, productB: b, count, confidence: Math.round((count / sales.length) * 100) };
      });

    const percentiles = this.percentiles(revenues);

    return {
      dates,
      revenues,
      counts,
      movingAvg7,
      weightedMA,
      ema,
      linearRegression: linearReg,
      correlation,
      stdDev,
      zScores,
      abcAnalysis,
      percentiles,
      aprioriRules: topRules,
      totalSales: sales.length,
      totalRevenue: revenues.reduce((a, b) => a + b, 0),
      avgDailyRevenue: revenues.length > 0 ? revenues.reduce((a, b) => a + b, 0) / revenues.length : 0,
    };
  }

  private movingAverage(data: number[], window: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - window + 1);
      const slice = data.slice(start, i + 1);
      result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    }
    return result;
  }

  private weightedMovingAverage(data: number[], window: number): number[] {
    const result: number[] = [];
    const weightSum = (window * (window + 1)) / 2;
    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - window + 1);
      const slice = data.slice(start, i + 1);
      let weighted = 0;
      slice.forEach((v, idx) => { weighted += v * (idx + 1); });
      result.push(weighted / weightSum);
    }
    return result;
  }

  private exponentialMovingAverage(data: number[], alpha: number): number[] {
    const result: number[] = [];
    if (data.length === 0) return result;
    result.push(data[0]);
    for (let i = 1; i < data.length; i++) {
      result.push(alpha * data[i] + (1 - alpha) * result[i - 1]);
    }
    return result;
  }

  private linearRegression(data: number[]): { slope: number; intercept: number; r2: number; predictions: number[] } {
    const n = data.length;
    if (n === 0) return { slope: 0, intercept: 0, r2: 0, predictions: [] };
    const x = data.map((_, i) => i);
    const xMean = x.reduce((a, b) => a + b, 0) / n;
    const yMean = data.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0, ssRes = 0, ssTot = 0;
    for (let i = 0; i < n; i++) {
      num += (x[i] - xMean) * (data[i] - yMean);
      den += (x[i] - xMean) ** 2;
    }
    const slope = den !== 0 ? num / den : 0;
    const intercept = yMean - slope * xMean;
    for (let i = 0; i < n; i++) {
      const pred = slope * i + intercept;
      ssRes += (data[i] - pred) ** 2;
      ssTot += (data[i] - yMean) ** 2;
    }
    const r2 = ssTot !== 0 ? 1 - ssRes / ssTot : 0;
    const predictions = data.map((_, i) => slope * i + intercept);
    return { slope, intercept, r2, predictions };
  }

  private correlation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 2) return 0;
    const xArr = x.slice(0, n), yArr = y.slice(0, n);
    const xMean = xArr.reduce((a, b) => a + b, 0) / n;
    const yMean = yArr.reduce((a, b) => a + b, 0) / n;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      num += (xArr[i] - xMean) * (yArr[i] - yMean);
      dx += (xArr[i] - xMean) ** 2;
      dy += (yArr[i] - yMean) ** 2;
    }
    const den = Math.sqrt(dx * dy);
    return den !== 0 ? num / den : 0;
  }

  private standardDeviation(data: number[]): number {
    if (data.length < 2) return 0;
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const variance = data.reduce((sum, val) => sum + (val - mean) ** 2, 0) / data.length;
    return Math.sqrt(variance);
  }

  private zScores(data: number[]): number[] {
    if (data.length < 2) return data.map(() => 0);
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const std = this.standardDeviation(data);
    if (std === 0) return data.map(() => 0);
    return data.map((v) => (v - mean) / std);
  }

  private abcAnalysis(sales: Record<string, number>, total: number): { product: string; revenue: number; percentage: number; class: string }[] {
    const items = Object.entries(sales)
      .sort((a, b) => b[1] - a[1])
      .map(([product, revenue]) => ({ product, revenue, percentage: total > 0 ? (revenue / total) * 100 : 0, class: '' }));
    let cumulative = 0;
    items.forEach((item) => {
      cumulative += item.percentage;
      item.class = cumulative <= 80 ? 'A' : cumulative <= 95 ? 'B' : 'C';
    });
    return items;
  }

  private percentiles(data: number[]): Record<string, number> {
    if (data.length === 0) return {};
    const sorted = [...data].sort((a, b) => a - b);
    const get = (p: number) => {
      const idx = Math.ceil((p / 100) * sorted.length) - 1;
      return sorted[Math.max(0, idx)];
    };
    return { p10: get(10), p25: get(25), p50: get(50), p75: get(75), p90: get(90), p95: get(95) };
  }
}
