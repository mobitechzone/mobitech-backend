import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { PriceResearchDto, BusinessAdvisorDto } from './dto/ai.dto';

@ApiTags('AI Agent')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('price-research')
  @ApiOperation({ summary: 'Research product prices in Tunisian shops' })
  priceResearch(@Body() dto: PriceResearchDto) {
    return this.aiService.priceResearch(dto);
  }

  @Post('business-advisor')
  @ApiOperation({ summary: 'Get AI business advice based on your data' })
  businessAdvisor(@Body() dto: BusinessAdvisorDto) {
    return this.aiService.businessAdvisor(dto);
  }
}
