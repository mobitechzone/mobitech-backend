import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

class QueryPaymentsDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @ApiPropertyOptional({ enum: ['SALE', 'REPAIR'] })
  @IsOptional()
  @IsIn(['SALE', 'REPAIR'])
  type?: 'SALE' | 'REPAIR';

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @ApiOperation({ summary: 'Unified payment history for sales and repairs' })
  list(@Query() query: QueryPaymentsDto) {
    return this.paymentsService.list(query);
  }

  @Get('summary/daily')
  @ApiOperation({ summary: 'Daily payment summary between two dates' })
  dailySummary(@Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    return this.paymentsService.dailySummary(new Date(startDate), new Date(endDate));
  }
}
