import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role, User } from '@prisma/client';
import { SettingsService } from './settings.service';
import { SetSettingDto, UpdateSettingsBulkDto } from './dto/settings.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all settings (grouped and flat)' })
  getAll() {
    return this.settingsService.getAll();
  }

  @Get(':key')
  @ApiOperation({ summary: 'Get a single setting by key' })
  get(@Param('key') key: string) {
    return this.settingsService.getValue(key);
  }

  @Put()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Set a single setting (admin only)' })
  set(@Body() dto: SetSettingDto, @CurrentUser() actor: User) {
    return this.settingsService.set(dto.key, dto.value, dto.group, actor);
  }

  @Put('bulk')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update multiple settings at once (admin only)' })
  bulk(@Body() dto: UpdateSettingsBulkDto, @CurrentUser() actor: User) {
    return this.settingsService.bulkUpdate(dto.values, actor);
  }

  @Delete(':key')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a setting (admin only)' })
  remove(@Param('key') key: string, @CurrentUser() actor: User) {
    return this.settingsService.remove(key, actor);
  }
}
