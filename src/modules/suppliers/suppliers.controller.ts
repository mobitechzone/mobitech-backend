import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role, User } from '@prisma/client';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/suppliers.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Ip } from '@nestjs/common';

@ApiTags('Suppliers')
@ApiBearerAuth()
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a supplier (admin only)' })
  create(@Body() dto: CreateSupplierDto, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.suppliersService.create(dto, actor, ip);
  }

  @Get()
  @ApiOperation({ summary: 'List suppliers' })
  findAll(@Query() query: PaginationDto) {
    return this.suppliersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a supplier with products and purchase history' })
  findOne(@Param('id') id: string) {
    return this.suppliersService.findOne(id);
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a supplier (admin only)' })
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.suppliersService.update(id, dto, actor, ip);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a supplier (admin only)' })
  remove(@Param('id') id: string, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.suppliersService.remove(id, actor, ip);
  }
}
