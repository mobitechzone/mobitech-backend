import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role, User } from '@prisma/client';
import { InventoryService } from './inventory.service';
import { RecordMovementDto, TransferStockDto, QueryMovementDto } from './dto/inventory.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Ip } from '@nestjs/common';

@ApiTags('Inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('movements')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List all stock movements with filters (admin only)' })
  movements(@Query() query: QueryMovementDto) {
    return this.inventoryService.movements(query);
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Low stock and out of stock alerts' })
  alerts() {
    return this.inventoryService.alerts();
  }

  @Get('valuation')
  @ApiOperation({ summary: 'Inventory valuation' })
  valuation() {
    return this.inventoryService.valuation();
  }

  @Get('summaries')
  @ApiOperation({ summary: 'Inventory summary counts' })
  summaries() {
    return this.inventoryService.summaries();
  }

  @Get('products/:productId/history')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Stock history for a product (admin only)' })
  productHistory(@Param('productId') productId: string, @Query() query: PaginationDto) {
    return this.inventoryService.productHistory(productId, query);
  }

  @Post('products/:productId/record')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Record a stock movement (purchase/adjustment/return) (admin only)' })
  record(@Param('productId') productId: string, @Body() dto: RecordMovementDto, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.inventoryService.record(productId, dto, actor, ip);
  }

  @Post('products/:productId/transfer')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Transfer stock to another location (admin only)' })
  transfer(@Param('productId') productId: string, @Body() dto: TransferStockDto, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.inventoryService.transfer(productId, dto, actor, ip);
  }

  @Post('products/:productId/damaged')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Record damaged stock (admin only)' })
  damaged(@Param('productId') productId: string, @Body() dto: RecordMovementDto, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.inventoryService.damaged(productId, dto, actor, ip);
  }

  @Post('products/:productId/returns')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Record a customer return to stock (admin only)' })
  returns(@Param('productId') productId: string, @Body() dto: RecordMovementDto, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.inventoryService.returns(productId, dto, actor, ip);
  }
}
