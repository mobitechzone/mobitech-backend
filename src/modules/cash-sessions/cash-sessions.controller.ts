import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CashSessionsService } from './cash-sessions.service';
import { OpenCashSessionDto, CloseCashSessionDto, QueryCashSessionDto, AddCashInDto, AddCashOutDto } from './dto/cash-sessions.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@prisma/client';

@ApiTags('Cash Sessions')
@ApiBearerAuth()
@Controller('cash-sessions')
export class CashSessionsController {
  constructor(private readonly cashSessionsService: CashSessionsService) {}

  @Get('current')
  @ApiOperation({ summary: 'Get current active cash session for user' })
  getCurrent(@CurrentUser() user: User) {
    return this.cashSessionsService.getCurrentSession(user.id);
  }

  @Post('open')
  @ApiOperation({ summary: 'Open a new cash session with initial change fund float' })
  openSession(@Body() dto: OpenCashSessionDto, @CurrentUser() user: User) {
    return this.cashSessionsService.openSession(dto, user);
  }

  @Post(':id/cash-in')
  @ApiOperation({ summary: 'Add money / cash float to current active session' })
  addCashIn(
    @Param('id') id: string,
    @Body() dto: AddCashInDto,
    @CurrentUser() user: User,
  ) {
    return this.cashSessionsService.addCashIn(id, dto, user);
  }

  @Post(':id/cash-out')
  @ApiOperation({ summary: 'Record cash spending / expense paid from till' })
  addCashOut(
    @Param('id') id: string,
    @Body() dto: AddCashOutDto,
    @CurrentUser() user: User,
  ) {
    return this.cashSessionsService.addCashOut(id, dto, user);
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Close active cash session with counted cash float' })
  closeSession(
    @Param('id') id: string,
    @Body() dto: CloseCashSessionDto,
    @CurrentUser() user: User,
  ) {
    return this.cashSessionsService.closeSession(id, dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List all cash sessions' })
  findAll(@Query() query: QueryCashSessionDto) {
    return this.cashSessionsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get cash session details' })
  findOne(@Param('id') id: string) {
    return this.cashSessionsService.findOne(id);
  }
}
