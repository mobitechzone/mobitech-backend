import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role, User } from '@prisma/client';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto, UpdateExpenseDto, QueryExpenseDto } from './dto/expenses.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Ip } from '@nestjs/common';

@ApiTags('Expenses')
@ApiBearerAuth()
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create an expense (admin only)' })
  create(@Body() dto: CreateExpenseDto, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.expensesService.create(dto, actor, ip);
  }

  @Get()
  @ApiOperation({ summary: 'List expenses with category and date filters' })
  findAll(@Query() query: QueryExpenseDto) {
    return this.expensesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single expense' })
  findOne(@Param('id') id: string) {
    return this.expensesService.findOne(id);
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update an expense (admin only)' })
  update(@Param('id') id: string, @Body() dto: UpdateExpenseDto, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.expensesService.update(id, dto, actor, ip);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete an expense (admin only)' })
  remove(@Param('id') id: string, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.expensesService.remove(id, actor, ip);
  }
}
