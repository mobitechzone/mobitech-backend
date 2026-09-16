import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PublicService } from './public.service';

@ApiTags('Public - Repair Tracking')
@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Public()
  @Get('track/:token')
  @ApiOperation({ summary: 'Get repair status by tracking token' })
  async trackRepair(@Param('token') token: string) {
    return this.publicService.getRepairByToken(token);
  }

  @Public()
  @Get('track/:token/chat')
  @ApiOperation({ summary: 'Get chat messages for a repair' })
  async getChatMessages(@Param('token') token: string) {
    return this.publicService.getChatMessages(token);
  }

  @Public()
  @Post('track/:token/chat')
  @ApiOperation({ summary: 'Send a chat message' })
  async sendChatMessage(
    @Param('token') token: string,
    @Body() body: { sender?: string; message: string },
  ) {
    return this.publicService.sendChatMessage(
      token,
      body.sender || 'Customer',
      body.message,
    );
  }
}
