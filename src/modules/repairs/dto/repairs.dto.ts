import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, RepairStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDate, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class CreateRepairPartDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiProperty({ example: 'iPhone 15 screen' })
  @IsString()
  name: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 150 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @ApiProperty({ example: 220 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}

export class CreateRepairDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({ example: 'Ahmed Trabelsi' })
  @IsString()
  customerName: string;

  @ApiPropertyOptional({ example: '+216 22 555 555' })
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiProperty({ example: 'Smartphone' })
  @IsString()
  deviceType: string;

  @ApiPropertyOptional({ example: 'Samsung' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ example: 'Galaxy S23' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ example: '356789012345678' })
  @IsOptional()
  @IsString()
  imei?: string;

  @ApiPropertyOptional({ description: 'Screen lock password/pattern (optional)' })
  @IsOptional()
  @IsString()
  devicePassword?: string;

  @ApiPropertyOptional({ example: 'Charger, case' })
  @IsOptional()
  @IsString()
  accessories?: string;

  @ApiProperty({ example: 'Screen cracked, no display' })
  @IsString()
  problemDescription: string;

  @ApiPropertyOptional({ example: 'LCD damage confirmed' })
  @IsOptional()
  @IsString()
  diagnosis?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  repairNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  technicianId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  estimatedFinish?: Date;

  @ApiPropertyOptional({ example: 50, description: 'Base repair (diagnosis/labor) fee charged' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  repairCost?: number;

  @ApiPropertyOptional({ example: 40 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  laborCost?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiPropertyOptional({ example: '3 months' })
  @IsOptional()
  @IsString()
  warranty?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  internalNotes?: string;

  @ApiPropertyOptional({ type: [CreateRepairPartDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRepairPartDto)
  parts?: CreateRepairPartDto[];
}

export class UpdateRepairDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deviceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imei?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  devicePassword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accessories?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  problemDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  diagnosis?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  repairNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  technicianId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  estimatedFinish?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  repairCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  laborCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  warranty?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  internalNotes?: string;
}

export class ChangeRepairStatusDto {
  @ApiProperty({ enum: RepairStatus })
  @IsEnum(RepairStatus)
  status: RepairStatus;

  @ApiPropertyOptional({ example: 'Waiting for the screen to arrive' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class AddRepairPartsDto {
  @ApiProperty({ type: [CreateRepairPartDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateRepairPartDto)
  parts: CreateRepairPartDto[];
}

export class CreateRepairPaymentDto {
  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiPropertyOptional({ enum: ['DEPOSIT', 'PARTIAL', 'FINAL'], default: 'PARTIAL' })
  @IsOptional()
  @IsString()
  type?: 'DEPOSIT' | 'PARTIAL' | 'FINAL';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class QueryRepairDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: RepairStatus })
  @IsOptional()
  @IsEnum(RepairStatus)
  status?: RepairStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  technicianId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  startDate?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  endDate?: Date;

  @ApiPropertyOptional({ description: 'Only repairs with outstanding balance' })
  @IsOptional()
  outstanding?: boolean;

  @ApiPropertyOptional({ description: 'Only overdue repairs' })
  @IsOptional()
  overdue?: boolean;
}
