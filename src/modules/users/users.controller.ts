import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { Role, User } from '@prisma/client';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, ResetPasswordDto, QueryUserDto } from './dto/users.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Ip } from '@nestjs/common';

@ApiTags('Users')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a user (admin only)' })
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.usersService.create(dto, actor, ip);
  }

  @Get()
  @ApiOperation({ summary: 'List users with filters (admin only)' })
  findAll(@Query() query: QueryUserDto) {
    return this.usersService.findAll(query);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get the current user profile (admin only)' })
  me(@CurrentUser('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single user (admin only)' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Get(':id/login-history')
  @ApiOperation({ summary: 'View a user login history (admin only)' })
  loginHistory(@Param('id') id: string, @Query() query: PaginationDto) {
    return this.usersService.loginHistory(id, query);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a user (admin only)' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.usersService.update(id, dto, actor, ip);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Activate / deactivate a user (admin only)' })
  setStatus(@Param('id') id: string, @Body() body: { status: 'ACTIVE' | 'INACTIVE' }, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.usersService.setStatus(id, body.status, actor, ip);
  }

  @Post(':id/reset-password')
  @ApiOperation({ summary: 'Reset a user password (admin only)' })
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.usersService.resetPassword(id, dto.newPassword, actor, ip);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a user (admin only)' })
  remove(@Param('id') id: string, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.usersService.remove(id, actor, ip);
  }
}
