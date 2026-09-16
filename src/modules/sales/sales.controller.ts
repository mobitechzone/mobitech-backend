import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { SalesService } from './sales.service';
import { CreateSaleDto, RefundSaleDto, HoldSaleDto, QuerySaleDto } from './dto/sales.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Ip } from '@nestjs/common';

@ApiTags('Sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @ApiOperation({ summary: 'Complete a POS sale' })
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.salesService.create(dto, user, ip);
  }

  @Get()
  @ApiOperation({ summary: 'List sales with filters, pagination and sorting' })
  findAll(@Query() query: QuerySaleDto) {
    return this.salesService.findAll(query);
  }

  @Get('held')
  @ApiOperation({ summary: 'List held sales' })
  held(@Query() query: PaginationDto) {
    return this.salesService.listHeld(query);
  }

  @Post('hold')
  @ApiOperation({ summary: 'Hold a sale to resume later' })
  hold(@Body() dto: HoldSaleDto, @CurrentUser() user: AuthUser) {
    return this.salesService.hold(dto, user);
  }

  @Post('held/:id/resume')
  @ApiOperation({ summary: 'Resume a held sale' })
  resumeHeld(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.salesService.resumeHeld(id, user);
  }

  @Delete('held/:id')
  @ApiOperation({ summary: 'Discard a held sale' })
  discardHeld(@Param('id') id: string) {
    return this.salesService.discardHeld(id);
  }

  @Get('invoice/:invoiceNumber')
  @ApiOperation({ summary: 'Get a sale by invoice number' })
  findByInvoice(@Param('invoiceNumber') invoiceNumber: string) {
    return this.salesService.findByInvoice(invoiceNumber);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single sale' })
  findOne(@Param('id') id: string) {
    return this.salesService.findOne(id);
  }

  @Post(':id/refund')
  @ApiOperation({ summary: 'Refund a sale (permission controlled)' })
  refund(@Param('id') id: string, @Body() dto: RefundSaleDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.salesService.refund(id, dto, user, ip);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a sale (admin / permission controlled)' })
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.salesService.cancel(id, user, ip);
  }
}
