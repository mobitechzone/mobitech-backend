import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma, Product, User, Role, StockMovementType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto, UpdateProductDto, AdjustStockDto, QueryProductDto } from './dto/products.dto';
import { AuditService } from '../audit/audit.service';
import { generateEan13, generateSku } from '../../common/utils/barcode.utils';
import { toNumber } from '../../common/utils/number.utils';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateProductDto, actor: User, ip?: string) {
    this.assertAdmin(actor);
    const barcode = dto.barcode || generateEan13();
    const sku = dto.sku || generateSku();

    const [barcodeConflict, skuConflict] = await Promise.all([
      this.prisma.product.findUnique({ where: { barcode } }),
      this.prisma.product.findUnique({ where: { sku } }),
    ]);
    if (barcodeConflict) throw new ConflictException('A product with this barcode already exists');
    if (skuConflict) throw new ConflictException('A product with this SKU already exists');

    const infiniteStock = dto.infiniteStock ?? false;
    const initialStock = infiniteStock ? -1 : (dto.currentStock ?? 0);

    // Validate selling price against minimum selling price
    const minPrice = dto.minSellingPrice ?? dto.sellingPrice;
    if (dto.sellingPrice < minPrice) {
      throw new BadRequestException('Selling price cannot be lower than minimum selling price');
    }

    const product = await this.prisma.product.create({
      data: {
        name: dto.name,
        barcode,
        sku,
        imei: dto.imei,
        brand: dto.brand,
        categoryId: dto.categoryId === '' ? null : dto.categoryId,
        model: dto.model,
        color: dto.color,
        storage: dto.storage,
        ram: dto.ram,
        buyingPrice: dto.buyingPrice ?? 0,
        minSellingPrice: minPrice,
        sellingPrice: dto.sellingPrice,
        currentStock: initialStock,
        minStock: dto.minStock ?? 5,
        supplierId: dto.supplierId === '' ? null : dto.supplierId,
        warranty: dto.warranty,
        description: dto.description,
        image: dto.image,
        status: dto.status,
        notes: dto.notes,
        isFavorite: dto.isFavorite ?? false,
        isTaxable: dto.isTaxable ?? true,
        infiniteStock,
        ...(initialStock > 0
          ? {
              stockMovements: {
                create: {
                  type: StockMovementType.PURCHASE,
                  quantity: initialStock,
                  beforeStock: 0,
                  afterStock: initialStock,
                  userId: actor.id,
                  notes: 'Initial stock',
                },
              },
            }
          : {}),
      },
      include: { category: true, supplier: true },
    });

    await this.audit.log({
      action: 'CREATE',
      entity: 'PRODUCT',
      entityId: product.id,
      userId: actor.id,
      details: { name: product.name, barcode: product.barcode },
      ipAddress: ip,
    });

    return product;
  }

  async findAll(query: QueryProductDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.ProductWhereInput = {
      ...(query.brand ? { brand: query.brand } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.outOfStock ? { currentStock: 0 } : {}),
      ...(query.favoritesOnly ? { isFavorite: true } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { barcode: { contains: query.search, mode: 'insensitive' } },
              { sku: { contains: query.search, mode: 'insensitive' } },
              { imei: { contains: query.search, mode: 'insensitive' } },
              { brand: { contains: query.search, mode: 'insensitive' } },
              { model: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      query.sortBy === 'sellingPrice' || query.sortBy === 'buyingPrice' || query.sortBy === 'currentStock'
        ? { [query.sortBy]: query.sortOrder ?? 'desc' }
        : { createdAt: 'desc' };

    const total = await this.prisma.product.count({ where });
    let items = await this.prisma.product.findMany({
      where,
      include: { category: true, supplier: { select: { id: true, name: true } } },
      orderBy,
      ...(query.lowStock ? { take: Math.min(total, 5000) } : { skip: (page - 1) * limit, take: limit }),
    });

    if (query.lowStock) {
      items = items.filter((p) => Number(p.currentStock) <= Number(p.minStock));
      const totalPages = Math.ceil(items.length / limit);
      const start = (page - 1) * limit;
      items = items.slice(start, start + limit);
      return { items, total: items.length === 0 && page > 1 ? 0 : items.length, page, limit, totalPages };
    }

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true, supplier: true, stockMovements: { orderBy: { createdAt: 'desc' }, take: 50 } },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async findByBarcode(barcode: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        OR: [{ barcode: { equals: barcode } }, { sku: { equals: barcode } }, { imei: { equals: barcode } }],
      },
      include: { category: true },
    });
    if (!product) throw new NotFoundException('No product found for this barcode');
    return product;
  }

  async update(id: string, dto: UpdateProductDto, actor: User, ip?: string) {
    this.assertAdmin(actor);
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Product not found');

    // Validate selling price against minimum selling price if both provided
    if (dto.sellingPrice !== undefined && dto.minSellingPrice !== undefined) {
      if (dto.sellingPrice < dto.minSellingPrice) {
        throw new BadRequestException('Selling price cannot be lower than minimum selling price');
      }
    }

    const priceChanged =
      (dto.buyingPrice !== undefined && toNumber(dto.buyingPrice) !== toNumber(existing.buyingPrice)) ||
      (dto.sellingPrice !== undefined && toNumber(dto.sellingPrice) !== toNumber(existing.sellingPrice));

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...dto,
        minSellingPrice: dto.minSellingPrice ?? undefined,
        categoryId: dto.categoryId === '' ? null : dto.categoryId,
        supplierId: dto.supplierId === '' ? null : dto.supplierId,
      },
      include: { category: true, supplier: true },
    });

    await this.audit.log({
      action: priceChanged ? 'PRICE_CHANGE' : 'UPDATE',
      entity: 'PRODUCT',
      entityId: id,
      userId: actor.id,
      details: {
        changes: dto,
        previousPrice: existing.sellingPrice.toString(),
        newPrice: product.sellingPrice.toString(),
      },
      ipAddress: ip,
    });

    return product;
  }

  async remove(id: string, actor: User, ip?: string) {
    this.assertAdmin(actor);
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Product not found');
    await this.prisma.product.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'PRODUCT',
      entityId: id,
      userId: actor.id,
      details: { name: existing.name, barcode: existing.barcode },
      ipAddress: ip,
    });
    return { message: 'Product deleted' };
  }

  async adjustStock(id: string, dto: AdjustStockDto, actor: User, ip?: string) {
    this.assertAdmin(actor);
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');

    const before = product.currentStock;
    const after = dto.type === StockMovementType.DAMAGED || dto.type === StockMovementType.SALE
      ? before - dto.quantity
      : before + dto.quantity;
    if (after < 0) {
      throw new BadRequestException(`Insufficient stock. Only ${before} in stock.`);
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        currentStock: after,
        stockMovements: {
          create: {
            type: dto.type,
            quantity: dto.quantity,
            beforeStock: before,
            afterStock: after,
            reference: dto.reference,
            notes: dto.notes,
            userId: actor.id,
          },
        },
      },
      include: { category: true },
    });

    await this.audit.log({
      action: 'UPDATE',
      entity: 'PRODUCT',
      entityId: id,
      userId: actor.id,
      details: { stockAdjustment: { type: dto.type, quantity: dto.quantity, before, after } },
      ipAddress: ip,
    });

    return updated;
  }

  async lowStockList() {
    const products = await this.prisma.product.findMany({
      where: { status: 'ACTIVE' },
      include: { category: true },
    });
    const lowStock = products.filter((p) => !p.infiniteStock && Number(p.currentStock) <= Number(p.minStock));
    const outOfStock = products.filter((p) => !p.infiniteStock && p.currentStock === 0);
    return { lowStock, outOfStock };
  }

  async toggleFavorite(id: string, actor: User) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    return this.prisma.product.update({ where: { id }, data: { isFavorite: !product.isFavorite } });
  }

  async inventoryValuation() {
    const products = await this.prisma.product.findMany({ where: { status: 'ACTIVE' } });
    const valuation = products.reduce(
      (acc, p) => acc + toNumber(p.buyingPrice) * p.currentStock,
      0,
    );
    const retailValue = products.reduce(
      (acc, p) => acc + toNumber(p.sellingPrice) * p.currentStock,
      0,
    );
    const items = products.map((p) => ({
      id: p.id,
      name: p.name,
      currentStock: p.currentStock,
      buyingPrice: p.buyingPrice.toString(),
      stockValue: (toNumber(p.buyingPrice) * p.currentStock).toFixed(3),
      retailValue: (toNumber(p.sellingPrice) * p.currentStock).toFixed(3),
    }));
    return {
      totalCostValue: valuation,
      totalRetailValue: retailValue,
      potentialProfit: retailValue - valuation,
      productCount: products.length,
      items,
    };
  }

  private assertAdmin(actor: User) {
    if (actor.role !== Role.ADMIN) {
      throw new ForbiddenException('Only administrators can manage products');
    }
  }
}
