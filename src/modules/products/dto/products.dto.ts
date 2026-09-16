import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus, StockMovementType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'iPhone 15 Pro Max' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: '6194000111222' })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional({ example: 'IP15PM-256-BLK' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ example: '356789012345678' })
  @IsOptional()
  @IsString()
  imei?: string;

  @ApiPropertyOptional({ example: 'Apple' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'iPhone 15 Pro Max' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ example: 'Black' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ example: '256GB' })
  @IsOptional()
  @IsString()
  storage?: string;

  @ApiPropertyOptional({ example: '8GB' })
  @IsOptional()
  @IsString()
  ram?: string;

  @ApiProperty({ example: 3200 })
  @IsNumber()
  @Min(0)
  buyingPrice: number;

  @ApiPropertyOptional({ example: 3500 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minSellingPrice?: number;

  @ApiProperty({ example: 3990 })
  @IsNumber()
  @Min(0)
  sellingPrice: number;

  @ApiPropertyOptional({ example: -1 })
  @IsOptional()
  @IsInt()
  @Min(-1)
  currentStock?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  minStock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional({ example: '1 year' })
  @IsOptional()
  @IsString()
  warranty?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  isFavorite?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  isTaxable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  infiniteStock?: boolean;
}

export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imei?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ram?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  buyingPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  minSellingPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  sellingPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  minStock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  warranty?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  isFavorite?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  isTaxable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  infiniteStock?: boolean;
}

export class AdjustStockDto {
  @ApiProperty({ enum: StockMovementType, example: StockMovementType.MANUAL })
  @IsEnum(StockMovementType)
  type: StockMovementType;

  @ApiProperty({ example: 5 })
  @IsInt()
  quantity: number;

  @ApiPropertyOptional({ example: 'Stock correction' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reference?: string;
}

export class StockTransferDto {
  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class QueryProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ description: 'Search by name, barcode, SKU, IMEI, brand or model' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ description: 'Only products with stock below min stock' })
  @IsOptional()
  lowStock?: boolean;

  @ApiPropertyOptional({ description: 'Only out of stock products' })
  @IsOptional()
  outOfStock?: boolean;

  @ApiPropertyOptional({ description: 'Only favorite products' })
  @IsOptional()
  favoritesOnly?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}
