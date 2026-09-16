import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/suppliers.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateSupplierDto, actor: User, ip?: string) {
    const supplier = await this.prisma.supplier.create({ data: dto });
    await this.audit.log({ action: 'CREATE', entity: 'SUPPLIER', entityId: supplier.id, userId: actor.id, details: { name: dto.name }, ipAddress: ip });
    return supplier;
  }

  async findAll(query: { search?: string; page?: number; limit?: number }) {
    const where: Prisma.SupplierWhereInput = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { phone: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};
    if (!query.page && !query.limit) {
      return this.prisma.supplier.findMany({ where, orderBy: { name: 'asc' } });
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.supplier.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        products: { orderBy: { createdAt: 'desc' } },
        purchaseHistory: { orderBy: { createdAt: 'desc' }, include: { product: true }, take: 50 },
      },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto, actor: User, ip?: string) {
    const existing = await this.prisma.supplier.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Supplier not found');
    const supplier = await this.prisma.supplier.update({ where: { id }, data: dto });
    await this.audit.log({ action: 'UPDATE', entity: 'SUPPLIER', entityId: id, userId: actor.id, details: dto, ipAddress: ip });
    return supplier;
  }

  async remove(id: string, actor: User, ip?: string) {
    const existing = await this.prisma.supplier.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Supplier not found');
    await this.prisma.supplier.delete({ where: { id } });
    await this.audit.log({ action: 'DELETE', entity: 'SUPPLIER', entityId: id, userId: actor.id, details: { name: existing.name }, ipAddress: ip });
    return { message: 'Supplier deleted' };
  }

  async addPurchase(data: { supplierId: string; productId?: string; quantity: number; unitCost: number; notes?: string }) {
    const totalCost = Math.round(data.unitCost * data.quantity * 1000) / 1000;
    return this.prisma.supplierPurchase.create({
      data: {
        supplierId: data.supplierId,
        productId: data.productId,
        quantity: data.quantity,
        unitCost: data.unitCost,
        totalCost,
        notes: data.notes,
      },
    });
  }
}
