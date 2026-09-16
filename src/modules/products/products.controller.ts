import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role, User } from '@prisma/client';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto, AdjustStockDto, QueryProductDto } from './dto/products.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Ip } from '@nestjs/common';

@ApiTags('Products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a product (admin only)' })
  create(@Body() dto: CreateProductDto, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.productsService.create(dto, actor, ip);
  }

  @Get()
  @ApiOperation({ summary: 'List products with search, filters and pagination' })
  findAll(@Query() query: QueryProductDto) {
    return this.productsService.findAll(query);
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'Low stock and out of stock alerts' })
  lowStock() {
    return this.productsService.lowStockList();
  }

  @Get('valuation')
  @ApiOperation({ summary: 'Inventory valuation report' })
  valuation() {
    return this.productsService.inventoryValuation();
  }

  @Get('barcode/:code')
  @ApiOperation({ summary: 'Look up a product by barcode, SKU or IMEI' })
  findByBarcode(@Param('code') code: string) {
    return this.productsService.findByBarcode(code);
  }

  @Get('favorites')
  @ApiOperation({ summary: 'List favorite products for the POS' })
  favorites() {
    return this.productsService.findAll({ favoritesOnly: true, limit: 50 });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single product' })
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a product (admin only)' })
  update(@Param('id') id: string, @Body() dto: UpdateProductDto, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.productsService.update(id, dto, actor, ip);
  }

  @Patch(':id/stock')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Adjust product stock with a movement record (admin only)' })
  adjustStock(@Param('id') id: string, @Body() dto: AdjustStockDto, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.productsService.adjustStock(id, dto, actor, ip);
  }

  @Patch(':id/favorite')
  @ApiOperation({ summary: 'Toggle favorite status' })
  toggleFavorite(@Param('id') id: string, @CurrentUser() actor: User) {
    return this.productsService.toggleFavorite(id, actor);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a product (admin only)' })
  remove(@Param('id') id: string, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.productsService.remove(id, actor, ip);
  }
}
