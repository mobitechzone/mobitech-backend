import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CashSessionStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class OpenCashSessionDto {
  @ApiProperty({ example: 50, description: 'Opening change fund in the till' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  openingFund: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CloseCashSessionDto {
  @ApiProperty({ example: 320.5, description: 'Cash counted in the till at close' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  countedCash: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class QueryCashSessionDto extends PaginationDto {
  @ApiPropertyOptional({ enum: CashSessionStatus })
  @IsOptional()
  @IsEnum(CashSessionStatus)
  status?: CashSessionStatus;
}

export class AddCashInDto {
  @ApiProperty({ example: 50, description: 'Amount of cash added to the till float' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ example: 'Added change float' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class AddCashOutDto {
  @ApiProperty({ example: 25, description: 'Amount of cash spent from the till' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ example: 'MISCELLANEOUS' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ example: 'Store maintenance' })
  @IsString()
  notes: string;
}
