import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async global(query: string) {
    const q = query.trim();
    if (!q) return { query, results: { products: [], customers: [], repairs: [], sales: [], suppliers: [], employees: [] } };

    const [products, customers, repairs, sales, suppliers, employees] = await Promise.all([
      this.prisma.product.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { barcode: { contains: q, mode: 'insensitive' } },
            { sku: { contains: q, mode: 'insensitive' } },
            { imei: { contains: q, mode: 'insensitive' } },
            { brand: { contains: q, mode: 'insensitive' } },
          ],
        },
        include: { category: true },
        take: 10,
      }),
      this.prisma.customer.findMany({
        where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] },
        take: 10,
      }),
      this.prisma.repair.findMany({
        where: {
          OR: [
            { repairNumber: { contains: q, mode: 'insensitive' } },
            { customerName: { contains: q, mode: 'insensitive' } },
            { imei: { contains: q, mode: 'insensitive' } },
            { brand: { contains: q, mode: 'insensitive' } },
            { model: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 10,
      }),
      this.prisma.sale.findMany({
        where: { OR: [{ invoiceNumber: { contains: q, mode: 'insensitive' } }, { customer: { name: { contains: q, mode: 'insensitive' } } }] },
        include: { customer: { select: { name: true } }, employee: { select: { name: true } } },
        take: 10,
      }),
      this.prisma.supplier.findMany({
        where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] },
        take: 10,
      }),
      this.prisma.user.findMany({
        where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] },
        select: { id: true, name: true, email: true, role: true },
        take: 10,
      }),
    ]);

    return { query: q, results: { products, customers, repairs, sales, suppliers, employees } };
  }
}
