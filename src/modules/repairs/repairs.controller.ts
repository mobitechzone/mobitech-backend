import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { RepairsService } from './repairs.service';
import {
  CreateRepairDto,
  UpdateRepairDto,
  ChangeRepairStatusDto,
  AddRepairPartsDto,
  CreateRepairPaymentDto,
  QueryRepairDto,
} from './dto/repairs.dto';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Ip } from '@nestjs/common';

@ApiTags('Repairs')
@ApiBearerAuth()
@Controller('repairs')
export class RepairsController {
  constructor(private readonly repairsService: RepairsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a repair ticket' })
  create(@Body() dto: CreateRepairDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.repairsService.create(dto, user, ip);
  }

  @Get()
  @ApiOperation({ summary: 'List repairs with filters and pagination' })
  findAll(@Query() query: QueryRepairDto) {
    return this.repairsService.findAll(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Repair summary counts and outstanding balances' })
  summary() {
    return this.repairsService.summary();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a repair with timeline, parts, payments and images' })
  findOne(@Param('id') id: string) {
    return this.repairsService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a repair' })
  update(@Param('id') id: string, @Body() dto: UpdateRepairDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.repairsService.update(id, dto, user, ip);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Change repair status and log a timeline entry' })
  changeStatus(@Param('id') id: string, @Body() dto: ChangeRepairStatusDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.repairsService.changeStatus(id, dto, user, ip);
  }

  @Post(':id/parts')
  @ApiOperation({ summary: 'Add parts to a repair (deducts inventory)' })
  addParts(@Param('id') id: string, @Body() dto: AddRepairPartsDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.repairsService.addParts(id, dto, user, ip);
  }

  @Post(':id/payments')
  @ApiOperation({ summary: 'Record a repair payment (deposit / partial / final)' })
  addPayment(@Param('id') id: string, @Body() dto: CreateRepairPaymentDto, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.repairsService.addPayment(id, dto, user, ip);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a repair' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser, @Ip() ip: string) {
    return this.repairsService.remove(id, user, ip);
  }

  @Get(':id/chat')
  @ApiOperation({ summary: 'Get chat messages for a repair' })
  getChatMessages(@Param('id') id: string) {
    return this.repairsService.getChatMessages(id);
  }

  @Post(':id/chat')
  @ApiOperation({ summary: 'Send a chat message as technician' })
  sendChatMessage(
    @Param('id') id: string,
    @Body() body: { message: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.repairsService.sendTechnicianMessage(id, body.message, user);
  }
}
