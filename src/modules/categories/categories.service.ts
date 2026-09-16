import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/categories.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private slugify(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  async create(dto: CreateCategoryDto, actor: User, ip?: string) {
    const slug = this.slugify(dto.name);
    const exists = await this.prisma.category.findUnique({ where: { slug } });
    if (exists) throw new ConflictException('A category with this name already exists');
    const category = await this.prisma.category.create({
      data: { ...dto, slug },
      include: { _count: { select: { products: true } } },
    });
    await this.audit.log({ action: 'CREATE', entity: 'CATEGORY', entityId: category.id, userId: actor.id, details: { name: dto.name }, ipAddress: ip });
    return category;
  }

  async findAll(query: { search?: string; page?: number; limit?: number }) {
    const where: Prisma.CategoryWhereInput = query.search
      ? { name: { contains: query.search, mode: 'insensitive' } }
      : {};
    if (!query.page && !query.limit) {
      return this.prisma.category.findMany({
        where,
        include: { _count: { select: { products: true } } },
        orderBy: { name: 'asc' },
      });
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({ where, include: { _count: { select: { products: true } } }, orderBy: { name: 'asc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.category.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { products: { include: { _count: { select: { saleItems: true } } }, orderBy: { createdAt: 'desc' } } },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto, actor: User, ip?: string) {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Category not found');
    const category = await this.prisma.category.update({
      where: { id },
      data: { ...dto, ...(dto.name ? { slug: this.slugify(dto.name) } : {}) },
      include: { _count: { select: { products: true } } },
    });
    await this.audit.log({ action: 'UPDATE', entity: 'CATEGORY', entityId: id, userId: actor.id, details: dto, ipAddress: ip });
    return category;
  }

  async remove(id: string, actor: User, ip?: string) {
    const existing = await this.prisma.category.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Category not found');
    await this.prisma.category.delete({ where: { id } });
    await this.audit.log({ action: 'DELETE', entity: 'CATEGORY', entityId: id, userId: actor.id, details: { name: existing.name }, ipAddress: ip });
    return { message: 'Category deleted' };
  }
}
