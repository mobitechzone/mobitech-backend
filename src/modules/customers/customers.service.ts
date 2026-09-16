import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerDto, UpdateCustomerDto, AdjustLoyaltyDto, AdjustBalanceDto, QueryCustomerDto } from './dto/customers.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateCustomerDto, actor: User, ip?: string) {
    const customer = await this.prisma.customer.create({ data: dto });
    await this.audit.log({ action: 'CREATE', entity: 'CUSTOMER', entityId: customer.id, userId: actor.id, details: { name: dto.name }, ipAddress: ip });
    return customer;
  }

  async findAll(query: QueryCustomerDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.CustomerWhereInput = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { phone: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        include: { _count: { select: { sales: true, repairs: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        sales: { orderBy: { createdAt: 'desc' }, include: { items: true, employee: { select: { id: true, name: true } } }, take: 30 },
        repairs: { orderBy: { createdAt: 'desc' }, include: { timeline: true, payments: true }, take: 30 },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto, actor: User, ip?: string) {
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Customer not found');
    const customer = await this.prisma.customer.update({ where: { id }, data: dto });
    await this.audit.log({ action: 'UPDATE', entity: 'CUSTOMER', entityId: id, userId: actor.id, details: dto, ipAddress: ip });
    return customer;
  }

  async remove(id: string, actor: User, ip?: string) {
    const existing = await this.prisma.customer.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Customer not found');
    await this.prisma.customer.delete({ where: { id } });
    await this.audit.log({ action: 'DELETE', entity: 'CUSTOMER', entityId: id, userId: actor.id, details: { name: existing.name }, ipAddress: ip });
    return { message: 'Customer deleted' };
  }

  async adjustLoyalty(id: string, dto: AdjustLoyaltyDto, actor: User, ip?: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    const updated = await this.prisma.customer.update({
      where: { id },
      data: { loyaltyPoints: { increment: dto.points } },
    });
    await this.audit.log({ action: 'UPDATE', entity: 'CUSTOMER', entityId: id, userId: actor.id, details: { loyaltyDelta: dto.points }, ipAddress: ip });
    return updated;
  }

  async adjustBalance(id: string, dto: AdjustBalanceDto, actor: User, ip?: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    const updated = await this.prisma.customer.update({
      where: { id },
      data: { balance: { increment: dto.amount } },
    });
    await this.audit.log({ action: 'UPDATE', entity: 'CUSTOMER', entityId: id, userId: actor.id, details: { balanceDelta: dto.amount, reason: dto.reason }, ipAddress: ip });
    return updated;
  }

  async addLoyalty(customerId: string, points: number) {
    if (points <= 0) return;
    await this.prisma.customer.update({
      where: { id: customerId },
      data: { loyaltyPoints: { increment: Math.round(points) } },
    });
  }

  async search(term: string) {
    return this.prisma.customer.findMany({
      where: {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term, mode: 'insensitive' } },
        ],
      },
      include: { _count: { select: { sales: true, repairs: true } } },
      take: 20,
    });
  }
}
