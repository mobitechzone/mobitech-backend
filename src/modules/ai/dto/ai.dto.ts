import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PriceResearchDto {
  @ApiProperty({ example: 'iPhone 15 Pro Max 256GB' })
  @IsString()
  productName: string;

  @ApiPropertyOptional({ example: 'phone' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: 'Apple' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ example: '256GB' })
  @IsOptional()
  @IsString()
  storage?: string;

  @ApiPropertyOptional({ example: 'Black' })
  @IsOptional()
  @IsString()
  color?: string;
}

export class PriceSourceDto {
  @ApiProperty()
  shop: string;

  @ApiProperty()
  price: number;

  @ApiProperty()
  currency: string;

  @ApiPropertyOptional()
  url?: string;

  @ApiPropertyOptional()
  notes?: string;
}

export class PriceResearchResultDto {
  @ApiProperty()
  productName: string;

  @ApiProperty({ type: [PriceSourceDto] })
  sources: PriceSourceDto[];

  @ApiProperty()
  averagePrice: number;

  @ApiProperty()
  minPrice: number;

  @ApiProperty()
  maxPrice: number;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  summary: string;

  @ApiProperty()
  recommendation: string;
}

export class BusinessAdvisorDto {
  @ApiPropertyOptional({ example: 'Give me advice on how to improve my phone shop business' })
  @IsOptional()
  @IsString()
  question?: string;

  @ApiProperty()
  @IsNumber()
  totalProducts: number;

  @ApiProperty()
  @IsNumber()
  totalSales: number;

  @ApiProperty()
  @IsNumber()
  revenue: number;

  @ApiProperty()
  @IsNumber()
  profit: number;

  @ApiProperty()
  @IsNumber()
  lowStockCount: number;

  @ApiProperty()
  @IsNumber()
  outOfStockCount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  topProducts?: { name: string; quantity: number; revenue: number }[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  recentSales?: { total: number; createdAt: string; items: { productName: string; quantity: number }[] }[];
}

export class BusinessAdvisorResultDto {
  @ApiProperty()
  analysis: string;

  @ApiProperty()
  strengths: string[];

  @ApiProperty()
  weaknesses: string[];

  @ApiProperty()
  recommendations: string[];

  @ApiProperty()
  actionItems: string[];
}
