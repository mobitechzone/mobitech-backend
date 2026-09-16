import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OpenCashSessionDto, CloseCashSessionDto, QueryCashSessionDto, AddCashInDto, AddCashOutDto } from './dto/cash-sessions.dto';
import { User, CashSessionStatus, Prisma } from '@prisma/client';
import { toNumber, round3 } from '../../common/utils/number.utils';

@Injectable()
export class CashSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentSession(userId: string) {
    return this.prisma.cashSession.findFirst({
      where: {
        openedById: userId,
        status: CashSessionStatus.OPEN,
      },
      include: {
        openedBy: { select: { id: true, name: true, email: true } },
        _count: { select: { sales: true, expenses: true } },
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  async openSession(dto: OpenCashSessionDto, actor: User) {
    const existing = await this.getCurrentSession(actor.id);
    if (existing) {
      throw new BadRequestException('You already have an open cash session');
    }

    return this.prisma.cashSession.create({
      data: {
        openedById: actor.id,
        openingFund: dto.openingFund,
        status: CashSessionStatus.OPEN,
        notes: dto.notes,
      },
      include: {
        openedBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async addCashIn(id: string, dto: AddCashInDto, actor: User) {
    const session = await this.prisma.cashSession.findUnique({ where: { id } });
    if (!session || session.status === CashSessionStatus.CLOSED) {
      throw new BadRequestException('Active open cash session not found');
    }
    return this.prisma.cashSession.update({
      where: { id },
      data: {
        cashIn: { increment: dto.amount },
        notes: dto.notes ? `${session.notes ? session.notes + ' | ' : ''}Cash In (+${dto.amount}): ${dto.notes}` : session.notes,
      },
    });
  }

  async addCashOut(id: string, dto: AddCashOutDto, actor: User) {
    const session = await this.prisma.cashSession.findUnique({ where: { id } });
    if (!session || session.status === CashSessionStatus.CLOSED) {
      throw new BadRequestException('Active open cash session not found');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.expense.create({
        data: {
          category: (dto.category as any) || 'MISCELLANEOUS',
          description: dto.notes,
          amount: dto.amount,
          paymentMethod: 'CASH',
          userId: actor.id,
          cashSessionId: id,
        },
      });
      return tx.cashSession.update({
        where: { id },
        data: {
          cashExpenses: { increment: dto.amount },
        },
      });
    });
  }

  async closeSession(id: string, dto: CloseCashSessionDto, actor: User) {
    const session = await this.prisma.cashSession.findUnique({
      where: { id },
      include: { sales: true, expenses: true },
    });

    if (!session) {
      throw new NotFoundException('Cash session not found');
    }

    if (session.status === CashSessionStatus.CLOSED) {
      throw new BadRequestException('Cash session is already closed');
    }

    const openingFund = toNumber(session.openingFund, 0);
    const cashSales = toNumber(session.cashSales, 0);
    const cashIn = toNumber((session as any).cashIn, 0);
    const cashRefunds = toNumber(session.cashRefunds, 0);
    const cashExpenses = toNumber(session.cashExpenses, 0);
    const changeGiven = toNumber(session.changeGiven, 0);

    const expectedCash = round3(openingFund + cashSales + cashIn - cashRefunds - cashExpenses - changeGiven);
    const difference = round3(dto.countedCash - expectedCash);

    return this.prisma.cashSession.update({
      where: { id },
      data: {
        status: CashSessionStatus.CLOSED,
        closedById: actor.id,
        closedAt: new Date(),
        closingCounted: dto.countedCash,
        expectedCash,
        difference,
        closingNotes: dto.notes,
      },
      include: {
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
      },
    });
  }

  async findOne(id: string) {
    const session = await this.prisma.cashSession.findUnique({
      where: { id },
      include: {
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
        sales: { take: 20, orderBy: { createdAt: 'desc' } },
        expenses: { take: 20, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!session) throw new NotFoundException('Cash session not found');
    return session;
  }

  async findAll(query: QueryCashSessionDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.CashSessionWhereInput = {
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.cashSession.findMany({
        where,
        include: {
          openedBy: { select: { id: true, name: true } },
          closedBy: { select: { id: true, name: true } },
          _count: { select: { sales: true, expenses: true } },
        },
        orderBy: { openedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.cashSession.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
