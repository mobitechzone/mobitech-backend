import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, SaleStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class CreateSaleItemDto {
  @ApiPropertyOptional({ description: 'Product id. Omit for custom/typed items.' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiProperty({ example: 'iPhone 15 Pro Max' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: '6194000111222' })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 3990 })
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiPropertyOptional({ example: 3200, description: 'Unit cost used to compute profit' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  isTaxable?: boolean;
}

export class CreateSalePaymentDto {
  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiProperty({ example: 3990 })
  @IsNumber()
  @Min(0)
  amount: number;
}

export class CreateSaleDto {
  @ApiProperty({ type: [CreateSaleItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items: CreateSaleItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Guest customer name' })
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiPropertyOptional({ enum: ['FIXED', 'PERCENT'], default: 'FIXED' })
  @IsOptional()
  @IsString()
  discountType?: 'FIXED' | 'PERCENT';

  @ApiPropertyOptional({ example: 19, description: 'VAT percentage applied to taxable amount' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;

  @ApiProperty({ type: [CreateSalePaymentDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalePaymentDto)
  payments: CreateSalePaymentDto[];

  @ApiPropertyOptional({ description: 'Cash received, used to compute change' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  received?: number;

  @ApiPropertyOptional({ description: 'Flag that a custom price was applied (permission enforced server-side)' })
  @IsOptional()
  useCustomPrice?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RefundSaleDto {
  @ApiProperty({ example: 'Customer returned the phone' })
  @IsString()
  reason: string;
}

export class HoldSaleDto {
  @ApiProperty({ type: [CreateSaleItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items: CreateSaleItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiPropertyOptional({ enum: ['FIXED', 'PERCENT'], default: 'FIXED' })
  @IsOptional()
  @IsString()
  discountType?: 'FIXED' | 'PERCENT';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class QuerySaleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ description: 'Invoice number, product name, barcode or customer' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  startDate?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  endDate?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ enum: SaleStatus })
  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;

  @ApiPropertyOptional({ description: 'Filter by a product or barcode' })
  @IsOptional()
  @IsString()
  productId?: string;
}
