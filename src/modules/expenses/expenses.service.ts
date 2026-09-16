import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma, User, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateExpenseDto, UpdateExpenseDto, QueryExpenseDto } from './dto/expenses.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private assertAdmin(actor: User) {
    if (actor.role !== Role.ADMIN) throw new ForbiddenException('Only administrators can manage expenses');
  }

  async create(dto: CreateExpenseDto, actor: User, ip?: string) {
    this.assertAdmin(actor);
    const expense = await this.prisma.expense.create({
      data: { ...dto, userId: actor.id },
      include: { user: { select: { id: true, name: true } } },
    });
    await this.audit.log({ action: 'CREATE', entity: 'EXPENSE', entityId: expense.id, userId: actor.id, details: { category: dto.category, amount: dto.amount }, ipAddress: ip });
    return expense;
  }

  async findAll(query: QueryExpenseDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.ExpenseWhereInput = {
      ...(query.category ? { category: query.category } : {}),
      ...(query.startDate || query.endDate
        ? { date: { ...(query.startDate ? { gte: query.startDate } : {}), ...(query.endDate ? { lte: query.endDate } : {}) } }
        : {}),
    };
    const [items, total, totals] = await this.prisma.$transaction([
      this.prisma.expense.findMany({ where, include: { user: { select: { id: true, name: true } } }, orderBy: { date: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.expense.count({ where }),
      this.prisma.expense.aggregate({ where, _sum: { amount: true }, _count: true }),
    ]);
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      summary: { totalAmount: totals._sum.amount ?? 0, count: totals._count },
    };
  }

  async findOne(id: string) {
    const expense = await this.prisma.expense.findUnique({ where: { id }, include: { user: { select: { id: true, name: true } } } });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }

  async update(id: string, dto: UpdateExpenseDto, actor: User, ip?: string) {
    this.assertAdmin(actor);
    const existing = await this.prisma.expense.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Expense not found');
    const expense = await this.prisma.expense.update({ where: { id }, data: dto, include: { user: { select: { id: true, name: true } } } });
    await this.audit.log({ action: 'UPDATE', entity: 'EXPENSE', entityId: id, userId: actor.id, details: dto, ipAddress: ip });
    return expense;
  }

  async remove(id: string, actor: User, ip?: string) {
    this.assertAdmin(actor);
    const existing = await this.prisma.expense.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Expense not found');
    await this.prisma.expense.delete({ where: { id } });
    await this.audit.log({ action: 'DELETE', entity: 'EXPENSE', entityId: id, userId: actor.id, details: { description: existing.description }, ipAddress: ip });
    return { message: 'Expense deleted' };
  }
}
