import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma, RepairStatus, SaleStatus, StockMovementType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  startOfToday,
  endOfToday,
  startOfWeek,
  startOfMonth,
  startOfYear,
  formatDateRange,
  daysAgo,
} from '../../common/utils/date.utils';
import { toNumber } from '../../common/utils/number.utils';

export type ReportType = 'sales' | 'repairs' | 'inventory' | 'expenses' | 'employees' | 'customers' | 'financial';
export type ReportRange = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom';

export interface ReportQuery {
  type: ReportType;
  range?: ReportRange;
  startDate?: Date;
  endDate?: Date;
  employeeId?: string;
  technicianId?: string;
}

export interface ExportOptions {
  format: 'csv' | 'xlsx' | 'pdf';
  title: string;
  filename: string;
  columns: string[];
  rows: (string | number)[][];
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveRange(query: ReportQuery) {
    const range = query.range ?? 'month';
    const custom = formatDateRange(range);
    if (custom) return custom;
    return { start: query.startDate ?? daysAgo(30), end: query.endDate ?? endOfToday() };
  }

  // ============================================================
  // Report builders
  // ============================================================

  async salesReport(query: ReportQuery) {
    const { start, end } = this.resolveRange(query);
    const sales = await this.prisma.sale.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      },
      include: { items: true, payments: true, customer: { select: { name: true } }, employee: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const revenue = sales.reduce((a, s) => a + Number(s.total), 0);
    const profit = sales.reduce((a, s) => a + Number(s.profit), 0);
    const cost = sales.reduce((a, s) => a + Number(s.cost), 0);
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    const paymentMethodDistribution: Record<string, number> = {};
    for (const s of sales) {
      paymentMethodDistribution[s.paymentMethod] = (paymentMethodDistribution[s.paymentMethod] ?? 0) + Number(s.total);
    }

    const byEmployee: Record<string, { revenue: number; profit: number; count: number }> = {};
    for (const s of sales) {
      const key = s.employee?.name ?? 'Unknown';
      byEmployee[key] = byEmployee[key] ?? { revenue: 0, profit: 0, count: 0 };
      byEmployee[key].revenue += Number(s.total);
      byEmployee[key].profit += Number(s.profit);
      byEmployee[key].count += 1;
    }

    const topProducts = new Map<string, { name: string; quantity: number; revenue: number; profit: number }>();
    for (const s of sales) {
      for (const item of s.items) {
        const entry = topProducts.get(item.productName) ?? { name: item.productName, quantity: 0, revenue: 0, profit: 0 };
        entry.quantity += item.quantity;
        entry.revenue += Number(item.lineTotal);
        entry.profit += Number(item.lineTotal) - Number(item.cost);
        topProducts.set(item.productName, entry);
      }
    }

    const hourlySales: Record<string, number> = {};
    for (const s of sales) {
      const hour = new Date(s.createdAt).getHours();
      hourlySales[`${String(hour).padStart(2, '0')}:00`] = (hourlySales[hour] ?? 0) + Number(s.total);
    }

    return {
      range: { start, end },
      summary: {
        count: sales.length,
        revenue,
        profit,
        cost,
        margin,
        averageOrderValue: sales.length ? revenue / sales.length : 0,
        refunded: sales.filter((s) => s.status === SaleStatus.REFUNDED).length,
        cancelled: sales.filter((s) => s.status === SaleStatus.CANCELLED).length,
      },
      paymentMethodDistribution,
      employeePerformance: byEmployee,
      topProducts: [...topProducts.values()].sort((a, b) => b.revenue - a.revenue),
      worstProducts: [...topProducts.values()].sort((a, b) => a.revenue - b.revenue).slice(0, 8),
      hourlySales,
      dailySales: this.groupByDay(sales, (s) => s.createdAt, (s) => Number(s.total)),
      sales,
    };
  }

  async repairsReport(query: ReportQuery) {
    const { start, end } = this.resolveRange(query);
    const repairs = await this.prisma.repair.findMany({
      where: {
        dateReceived: { gte: start, lte: end },
        ...(query.technicianId ? { technicianId: query.technicianId } : {}),
      },
      include: { parts: true, payments: true, technician: { select: { name: true } }, customer: { select: { name: true } } },
      orderBy: { dateReceived: 'desc' },
    });

    const revenue = repairs.reduce((a, r) => a + Number(r.totalCost), 0);
    const profit = repairs.reduce((a, r) => a + Number(r.profit), 0);
    const partsCost = repairs.reduce((a, r) => a + Number(r.partsCost), 0);
    const laborCost = repairs.reduce((a, r) => a + Number(r.laborCost), 0);
    const outstanding = repairs.reduce((a, r) => a + Number(r.remainingBalance), 0);
    const completed = repairs.filter((r) => r.status === RepairStatus.DELIVERED || r.status === RepairStatus.READY).length;
    const pending = repairs.filter((r) => !['DELIVERED', 'CANCELLED'].includes(r.status)).length;
    const cancelled = repairs.filter((r) => r.status === RepairStatus.CANCELLED).length;

    const byProblem = new Map<string, { problem: string; count: number; revenue: number; profit: number }>();
    for (const r of repairs) {
      const key = r.problemDescription;
      const entry = byProblem.get(key) ?? { problem: key, count: 0, revenue: 0, profit: 0 };
      entry.count += 1;
      entry.revenue += Number(r.totalCost);
      entry.profit += Number(r.profit);
      byProblem.set(key, entry);
    }

    const byTechnician: Record<string, { repairs: number; revenue: number; profit: number; avgTime: number; totalTime: number }> = {};
    for (const r of repairs) {
      const key = r.technician?.name ?? 'Unassigned';
      byTechnician[key] = byTechnician[key] ?? { repairs: 0, revenue: 0, profit: 0, avgTime: 0, totalTime: 0 };
      byTechnician[key].repairs += 1;
      byTechnician[key].revenue += Number(r.totalCost);
      byTechnician[key].profit += Number(r.profit);
      if (r.completionDate) {
        const days = Math.max((r.completionDate.getTime() - r.dateReceived.getTime()) / (1000 * 60 * 60 * 24), 0);
        byTechnician[key].totalTime += days;
      }
    }
    for (const key of Object.keys(byTechnician)) {
      byTechnician[key].avgTime = byTechnician[key].repairs ? byTechnician[key].totalTime / byTechnician[key].repairs : 0;
    }

    const averageRepairDays =
      repairs.filter((r) => r.completionDate).length > 0
        ? repairs
            .filter((r) => r.completionDate)
            .reduce((acc, r) => acc + (r.completionDate!.getTime() - r.dateReceived.getTime()) / (1000 * 60 * 60 * 24), 0) /
          repairs.filter((r) => r.completionDate).length
        : 0;

    return {
      range: { start, end },
      summary: {
        count: repairs.length,
        revenue,
        profit,
        partsCost,
        laborCost,
        outstanding,
        completed,
        pending,
        cancelled,
        averageRepairDays,
      },
      mostCommonRepairs: [...byProblem.values()].sort((a, b) => b.count - a.count),
      mostProfitableRepairs: [...byProblem.values()].sort((a, b) => b.profit - a.profit),
      technicianPerformance: byTechnician,
      dailyRepairs: this.groupByDay(repairs, (r) => r.dateReceived, (r) => Number(r.totalCost)),
      repairs,
    };
  }

  async inventoryReport() {
    const products = await this.prisma.product.findMany({
      where: { status: 'ACTIVE' },
      include: { category: true, supplier: { select: { name: true } } },
    });
    const valuation = products.reduce((a, p) => a + Number(p.buyingPrice) * p.currentStock, 0);
    const retail = products.reduce((a, p) => a + Number(p.sellingPrice) * p.currentStock, 0);
    return {
      summary: {
        productCount: products.length,
        units: products.reduce((a, p) => a + p.currentStock, 0),
        stockValue: valuation,
        retailValue: retail,
        potentialProfit: retail - valuation,
        lowStock: products.filter((p) => Number(p.currentStock) <= Number(p.minStock)).length,
        outOfStock: products.filter((p) => p.currentStock === 0).length,
      },
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        category: p.category?.name ?? null,
        supplier: p.supplier?.name ?? null,
        stock: p.currentStock,
        minStock: p.minStock,
        buyingPrice: Number(p.buyingPrice),
        sellingPrice: Number(p.sellingPrice),
        stockValue: Number(p.buyingPrice) * p.currentStock,
        retailValue: Number(p.sellingPrice) * p.currentStock,
      })),
    };
  }

  async expensesReport(query: ReportQuery) {
    const { start, end } = this.resolveRange(query);
    const expenses = await this.prisma.expense.findMany({
      where: { date: { gte: start, lte: end } },
      include: { user: { select: { name: true } } },
      orderBy: { date: 'desc' },
    });
    const total = expenses.reduce((a, e) => a + Number(e.amount), 0);
    const byCategory: Record<string, { count: number; amount: number }> = {};
    for (const e of expenses) {
      byCategory[e.category] = byCategory[e.category] ?? { count: 0, amount: 0 };
      byCategory[e.category].count += 1;
      byCategory[e.category].amount += Number(e.amount);
    }
    return {
      range: { start, end },
      summary: { total, count: expenses.length, averagePerDay: this.daysBetween(start, end) ? total / this.daysBetween(start, end) : total },
      byCategory,
      expenses,
    };
  }

  async employeeReport(query: ReportQuery) {
    const { start, end } = this.resolveRange(query);
    const employees = await this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        _count: { select: { sales: true } },
        sales: { where: { createdAt: { gte: start, lte: end }, status: SaleStatus.COMPLETED }, select: { total: true, profit: true } },
        repairs: { where: { dateReceived: { gte: start, lte: end } }, select: { totalCost: true, profit: true } },
        loginHistory: { take: 1, orderBy: { createdAt: 'desc' } },
      },
    });
    return {
      range: { start, end },
      employees: employees.map((e) => ({
        id: e.id,
        name: e.name,
        email: e.email,
        role: e.role,
        status: e.status,
        lastLogin: e.loginHistory[0]?.createdAt ?? null,
        salesCount: e.sales.length,
        salesRevenue: e.sales.reduce((a, s) => a + Number(s.total), 0),
        salesProfit: e.sales.reduce((a, s) => a + Number(s.profit), 0),
        repairsCount: e.repairs.length,
        repairRevenue: e.repairs.reduce((a, r) => a + Number(r.totalCost), 0),
        repairProfit: e.repairs.reduce((a, r) => a + Number(r.profit), 0),
      })),
    };
  }

  async customerReport(query: ReportQuery) {
    const { start, end } = this.resolveRange(query);
    const customers = await this.prisma.customer.findMany({
      include: {
        sales: { where: { createdAt: { gte: start, lte: end }, status: SaleStatus.COMPLETED }, select: { total: true, profit: true } },
        repairs: { where: { dateReceived: { gte: start, lte: end } }, select: { totalCost: true, remainingBalance: true } },
        _count: { select: { sales: true, repairs: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      range: { start, end },
      summary: {
        count: customers.length,
        totalRevenue: customers.reduce((a, c) => a + c.sales.reduce((x, s) => x + Number(s.total), 0), 0),
        outstandingBalance: customers.reduce((a, c) => a + Number(c.balance), 0),
        totalLoyaltyPoints: customers.reduce((a, c) => a + c.loyaltyPoints, 0),
      },
      customers: customers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        balance: Number(c.balance),
        loyaltyPoints: c.loyaltyPoints,
        salesCount: c._count.sales,
        repairsCount: c._count.repairs,
        salesRevenue: c.sales.reduce((a, s) => a + Number(s.total), 0),
        repairRevenue: c.repairs.reduce((a, r) => a + Number(r.totalCost), 0),
        outstandingRepairs: c.repairs.reduce((a, r) => a + Number(r.remainingBalance), 0),
      })),
    };
  }

  async financialReport(query: ReportQuery) {
    const { start, end } = this.resolveRange(query);
    const [sales, repairs, expenses, payments] = await Promise.all([
      this.prisma.sale.aggregate({
        where: { createdAt: { gte: start, lte: end }, status: SaleStatus.COMPLETED },
        _sum: { total: true, profit: true, cost: true, tax: true },
        _count: true,
      }),
      this.prisma.repair.aggregate({
        where: { dateReceived: { gte: start, lte: end } },
        _sum: { totalCost: true, profit: true, partsCost: true, laborCost: true, amountPaid: true, remainingBalance: true },
        _count: true,
      }),
      this.prisma.expense.aggregate({ where: { date: { gte: start, lte: end } }, _sum: { amount: true }, _count: true }),
      this.prisma.payment.aggregate({ where: { createdAt: { gte: start, lte: end } }, _sum: { amount: true } }),
    ]);

    const salesRevenue = toNumber(sales._sum.total);
    const salesProfit = toNumber(sales._sum.profit);
    const salesCost = toNumber(sales._sum.cost);
    const taxCollected = toNumber(sales._sum.tax);
    const repairRevenue = toNumber(repairs._sum.totalCost);
    const repairProfit = toNumber(repairs._sum.profit);
    const repairPartsCost = toNumber(repairs._sum.partsCost);
    const repairLaborCost = toNumber(repairs._sum.laborCost);
    const expenseTotal = toNumber(expenses._sum.amount);
    const cashReceived = toNumber(payments._sum.amount) + toNumber(repairs._sum.amountPaid);

    const grossProfit = salesProfit + repairProfit;
    const netProfit = grossProfit - expenseTotal;
    const totalRevenue = salesRevenue + repairRevenue;
    const margin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    return {
      range: { start, end },
      income: {
        salesRevenue,
        repairRevenue,
        totalRevenue,
        taxCollected,
      },
      expenses: {
        salesCost,
        repairPartsCost,
        repairLaborCost,
        operatingExpenses: expenseTotal,
        totalExpenses: salesCost + repairPartsCost + repairLaborCost + expenseTotal,
      },
      profit: {
        grossProfit,
        netProfit,
        margin,
      },
      cashFlow: {
        received: cashReceived,
        outstandingRepairPayments: toNumber(repairs._sum.remainingBalance),
        netCashFlow: cashReceived - expenseTotal,
      },
      counts: {
        sales: sales._count ?? 0,
        repairs: repairs._count ?? 0,
        expenses: expenses._count ?? 0,
      },
      daily: await this.dailyFinancial(start, end),
    };
  }

  private async dailyFinancial(start: Date, end: Date) {
    const sales = await this.prisma.sale.findMany({
      where: { createdAt: { gte: start, lte: end }, status: SaleStatus.COMPLETED },
      select: { createdAt: true, total: true, profit: true },
    });
    const repairs = await this.prisma.repair.findMany({
      where: { dateReceived: { gte: start, lte: end } },
      select: { dateReceived: true, totalCost: true, profit: true },
    });
    const expenses = await this.prisma.expense.findMany({
      where: { date: { gte: start, lte: end } },
      select: { date: true, amount: true },
    });

    const days = new Map<string, { revenue: number; profit: number; expenses: number }>();
    for (const s of sales) {
      const day = new Date(s.createdAt).toISOString().slice(0, 10);
      const d = days.get(day) ?? { revenue: 0, profit: 0, expenses: 0 };
      d.revenue += Number(s.total);
      d.profit += Number(s.profit);
      days.set(day, d);
    }
    for (const r of repairs) {
      const day = new Date(r.dateReceived).toISOString().slice(0, 10);
      const d = days.get(day) ?? { revenue: 0, profit: 0, expenses: 0 };
      d.revenue += Number(r.totalCost);
      d.profit += Number(r.profit);
      days.set(day, d);
    }
    for (const e of expenses) {
      const day = new Date(e.date).toISOString().slice(0, 10);
      const d = days.get(day) ?? { revenue: 0, profit: 0, expenses: 0 };
      d.expenses += Number(e.amount);
      days.set(day, d);
    }
    return [...days.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, v]) => ({ day, ...v, net: v.profit - v.expenses }));
  }

  // ============================================================
  // Generic report fetch used by exports
  // ============================================================

  async build(query: ReportQuery): Promise<{ title: string; columns: string[]; rows: (string | number)[][] }> {
    switch (query.type) {
      case 'sales': {
        const r = await this.salesReport(query);
        return {
          title: 'Sales Report',
          columns: ['Invoice', 'Date', 'Employee', 'Customer', 'Items', 'Total (TND)', 'Profit (TND)', 'Status'],
          rows: r.sales.map((s) => [
            s.invoiceNumber,
            new Date(s.createdAt).toISOString().slice(0, 10),
            s.employee?.name ?? '',
            s.customer?.name ?? 'Guest',
            s.items.length,
            Number(s.total),
            Number(s.profit),
            s.status,
          ]),
        };
      }
      case 'repairs': {
        const r = await this.repairsReport(query);
        return {
          title: 'Repair Report',
          columns: ['Repair #', 'Received', 'Customer', 'Device', 'Technician', 'Status', 'Total (TND)', 'Paid (TND)', 'Remaining (TND)', 'Profit (TND)'],
          rows: r.repairs.map((x) => [
            x.repairNumber,
            new Date(x.dateReceived).toISOString().slice(0, 10),
            x.customerName,
            `${x.brand ?? ''} ${x.model ?? ''}`.trim(),
            x.technician?.name ?? '',
            x.status,
            Number(x.totalCost),
            Number(x.amountPaid),
            Number(x.remainingBalance),
            Number(x.profit),
          ]),
        };
      }
      case 'inventory': {
        const r = await this.inventoryReport();
        return {
          title: 'Inventory Report',
          columns: ['Name', 'SKU', 'Barcode', 'Category', 'Stock', 'Min', 'Buying (TND)', 'Selling (TND)', 'Stock Value (TND)'],
          rows: r.products.map((p) => [p.name, p.sku ?? '', p.barcode ?? '', p.category ?? '', p.stock, p.minStock, p.buyingPrice, p.sellingPrice, p.stockValue]),
        };
      }
      case 'expenses': {
        const r = await this.expensesReport(query);
        return {
          title: 'Expense Report',
          columns: ['Date', 'Category', 'Description', 'Amount (TND)', 'Payment', 'Recorded By'],
          rows: r.expenses.map((e) => [
            new Date(e.date).toISOString().slice(0, 10),
            e.category,
            e.description,
            Number(e.amount),
            e.paymentMethod,
            e.user?.name ?? '',
          ]),
        };
      }
      case 'employees': {
        const r = await this.employeeReport(query);
        return {
          title: 'Employee Report',
          columns: ['Name', 'Email', 'Role', 'Sales Count', 'Sales Revenue', 'Sales Profit', 'Repairs Count', 'Repair Revenue', 'Repair Profit'],
          rows: r.employees.map((e) => [e.name, e.email, e.role, e.salesCount, e.salesRevenue, e.salesProfit, e.repairsCount, e.repairRevenue, e.repairProfit]),
        };
      }
      case 'customers': {
        const r = await this.customerReport(query);
        return {
          title: 'Customer Report',
          columns: ['Name', 'Phone', 'Email', 'Sales Count', 'Repairs Count', 'Sales Revenue', 'Repair Revenue', 'Loyalty Points', 'Balance (TND)'],
          rows: r.customers.map((c) => [c.name, c.phone ?? '', c.email ?? '', c.salesCount, c.repairsCount, c.salesRevenue, c.repairRevenue, c.loyaltyPoints, c.balance]),
        };
      }
      case 'financial': {
        const r = await this.financialReport(query);
        return {
          title: 'Financial Report',
          columns: ['Metric', 'Value (TND)'],
          rows: [
            ['Sales Revenue', r.income.salesRevenue],
            ['Repair Revenue', r.income.repairRevenue],
            ['Total Revenue', r.income.totalRevenue],
            ['Sales Cost', r.expenses.salesCost],
            ['Repair Parts Cost', r.expenses.repairPartsCost],
            ['Repair Labor Cost', r.expenses.repairLaborCost],
            ['Operating Expenses', r.expenses.operatingExpenses],
            ['Total Expenses', r.expenses.totalExpenses],
            ['Gross Profit', r.profit.grossProfit],
            ['Net Profit', r.profit.netProfit],
            ['Margin (%)', Math.round(r.profit.margin * 100) / 100],
            ['Cash Received', r.cashFlow.received],
            ['Outstanding Repair Payments', r.cashFlow.outstandingRepairPayments],
          ],
        };
      }
      default:
        throw new BadRequestException('Unknown report type');
    }
  }

  // ============================================================
  // Export helpers
  // ============================================================

  toCsv(data: { columns: string[]; rows: (string | number)[][] }): string {
    const escape = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [data.columns.map(escape).join(',')];
    for (const row of data.rows) lines.push(row.map(escape).join(','));
    return lines.join('\n');
  }

  toXlsxBuffer(data: { title: string; columns: string[]; rows: (string | number)[][] }): Buffer {
    const XLSX = require('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([data.columns, ...data.rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, data.title.slice(0, 31));
    const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return Buffer.from(out);
  }

  async toPdfBuffer(data: { title: string; columns: string[]; rows: (string | number)[][] }): Promise<Buffer> {
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text(data.title, 14, 15);
    doc.setFontSize(9);
    autoTable(doc, {
      startY: 22,
      head: [data.columns],
      body: data.rows.map((r) => r.map((c) => String(c))),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [255, 122, 0], textColor: 0 },
    });
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(`Generated ${new Date().toLocaleString()}`, 14, doc.internal.pageSize.getHeight() - 8);
      doc.text(`Page ${i}/${pages}`, doc.internal.pageSize.getWidth() - 30, doc.internal.pageSize.getHeight() - 8);
    }
    return Buffer.from(doc.output('arraybuffer'));
  }

  private groupByDay<T>(items: T[], keyFn: (item: T) => Date, valFn: (item: T) => number): { day: string; value: number }[] {
    const map = new Map<string, number>();
    for (const item of items) {
      const day = new Date(keyFn(item)).toISOString().slice(0, 10);
      map.set(day, (map.get(day) ?? 0) + valFn(item));
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, value]) => ({ day, value }));
  }

  private daysBetween(start: Date, end: Date) {
    return Math.max(Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)), 1);
  }
}
