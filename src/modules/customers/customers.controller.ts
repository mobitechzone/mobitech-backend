import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto, AdjustLoyaltyDto, AdjustBalanceDto, QueryCustomerDto } from './dto/customers.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Ip } from '@nestjs/common';

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a customer' })
  create(@Body() dto: CreateCustomerDto, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.customersService.create(dto, actor, ip);
  }

  @Get()
  @ApiOperation({ summary: 'List customers' })
  findAll(@Query() query: QueryCustomerDto) {
    return this.customersService.findAll(query);
  }

  @Get('search')
  @ApiOperation({ summary: 'Quick customer search (POS)' })
  search(@Query('term') term: string) {
    return this.customersService.search(term ?? '');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a customer with purchase and repair history' })
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a customer' })
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.customersService.update(id, dto, actor, ip);
  }

  @Patch(':id/loyalty')
  @ApiOperation({ summary: 'Adjust loyalty points' })
  adjustLoyalty(@Param('id') id: string, @Body() dto: AdjustLoyaltyDto, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.customersService.adjustLoyalty(id, dto, actor, ip);
  }

  @Patch(':id/balance')
  @ApiOperation({ summary: 'Adjust customer balance' })
  adjustBalance(@Param('id') id: string, @Body() dto: AdjustBalanceDto, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.customersService.adjustBalance(id, dto, actor, ip);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a customer' })
  remove(@Param('id') id: string, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.customersService.remove(id, actor, ip);
  }
}
