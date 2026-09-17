import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PriceResearchDto,
  PriceResearchResultDto,
  BusinessAdvisorDto,
  BusinessAdvisorResultDto,
} from './dto/ai.dto';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly openrouterApiKey: string;
  private readonly openrouterBaseUrl = 'https://openrouter.ai/api/v1';

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.openrouterApiKey = this.config.get<string>('openrouter.apiKey') ?? '';
  }

  async priceResearch(dto: PriceResearchDto): Promise<PriceResearchResultDto> {
    this.ensureApiKey();

    const isPart = dto.type === 'part';

    const query = [
      dto.productName,
      dto.brand,
      dto.storage,
      dto.color,
    ].filter(Boolean).join(' ');

    const searchLabel = isPart
      ? `Search for "pièce détachée ${query}" prices in Tunisia — GSM guide, shops selling repair parts (écrans, batteries, chargeurs, cartes mères, hubs USB, vitres arrière, nappes, connecteurs)`
      : `Search for "${query}" prices in Tunisia`;

    const contextBlock = isPart
      ? `IMPORTANT: This is a PART/ACCESSORY search. Focus on GSM repair parts shops in Tunisia.

Search keywords to use: "pièce détachée", "éparation phone", "écran ${query}", "batterie ${query}", "piece detachee GSM Tunisia", "gsm guide pieces", "accessoire phone Tunisie"

PHONE PARTS typical prices in Tunisia (TND):
- iPhone 13/14 screen (original): 250-400 TND
- iPhone 13/14 screen (compatible): 120-200 TND
- iPhone 15/16 screen (original): 400-600 TND
- iPhone battery (original): 100-150 TND
- iPhone battery (compatible): 50-80 TND
- Samsung S23/S24 screen (original): 300-500 TND
- Samsung screen (compatible): 150-250 TND
- Samsung battery: 60-120 TND
- Xiaomi screen: 100-200 TND
- Charging port (iPhone): 80-150 TND
- Charging port (Samsung): 60-120 TND
- Back glass: 80-200 TND
- Camera lens: 50-120 TND
- SIM tray: 15-30 TND
- Flex cable/nappe: 30-80 TND
- Loudspeaker: 40-80 TND

Focus on shops in: Moncef Bay, La Marsa, Tunis, Sfax, Sousse.
Mention if parts are original (原装/OEM), compatible (compatible), or refurbished (reconditionné).`
      : `IMPORTANT CONTEXT for Tunisia market (year 2026):

PHONES (used):
- iPhone 13 Pro Max 128GB: 1200-1800 TND
- iPhone 13 Pro Max 256GB: 1500-2200 TND
- iPhone 14 Pro Max 128GB: 1800-2500 TND
- iPhone 15 Pro Max 256GB new: 4500-6000 TND
- Samsung Galaxy S23 Ultra: 2000-3000 TND
- Samsung Galaxy S24 Ultra new: 4000-5500 TND
- Xiaomi Redmi Note 13 new: 500-800 TND`;

    const prompt = `${searchLabel}

${contextBlock}

Search Facebook Marketplace Tunisia, GSM guide shops, local shops in Moncef Bay/La Marsa, and Tunisian online stores.

Return ONLY this JSON, nothing else:
{"sources":[{"shop":"name","price":1500,"notes":"info"}],"averagePrice":1500,"minPrice":1200,"maxPrice":1800,"summary":"brief summary","recommendation":"pricing advice"}

Rules:
- All prices MUST be realistic TND amounts
- Numbers only, no strings
- 3 to 5 sources minimum
- Be friendly and helpful
- ${isPart ? 'For parts, mention if price is for original or compatible/generic part' : 'For phones, mention condition (new/used/excellent/good)'}`;

    const response = await this.callOpenRouter(prompt);
    this.logger.debug(`AI raw: ${response.substring(0, 800)}`);

    try {
      const cleaned = this.extractJson(response);
      this.logger.debug(`Cleaned: ${cleaned.substring(0, 800)}`);
      const parsed = JSON.parse(cleaned);

      const sources = (parsed.sources || []).map((s: any) => ({
        shop: String(s.shop || 'Unknown'),
        price: this.toNum(s.price),
        currency: 'TND',
        notes: s.notes ? String(s.notes) : undefined,
      })).filter((s: any) => s.price > 0);

      const avg = this.toNum(parsed.averagePrice);
      const min = this.toNum(parsed.minPrice);
      const max = this.toNum(parsed.maxPrice);

      // Calculate from sources if top-level values are bad
      const finalAvg = avg > 0 ? avg : (sources.length ? Math.round(sources.reduce((a: number, s: any) => a + s.price, 0) / sources.length) : 0);
      const finalMin = min > 0 ? min : (sources.length ? Math.min(...sources.map((s: any) => s.price)) : 0);
      const finalMax = max > 0 ? max : (sources.length ? Math.max(...sources.map((s: any) => s.price)) : 0);

      return {
        productName: query,
        sources,
        averagePrice: finalAvg,
        minPrice: finalMin,
        maxPrice: finalMax,
        currency: 'TND',
        summary: parsed.summary || '',
        recommendation: parsed.recommendation || '',
      };
    } catch (err) {
      this.logger.error(`Parse failed: ${err}`);
      // Try to salvage: extract any prices we can from the raw text
      const prices = this.extractPricesFromText(response);
      const summary = this.extractSummaryFromText(response);
      return {
        productName: query,
        sources: prices,
        averagePrice: prices.length ? Math.round(prices.reduce((a, p) => a + p.price, 0) / prices.length) : 0,
        minPrice: prices.length ? Math.min(...prices.map(p => p.price)) : 0,
        maxPrice: prices.length ? Math.max(...prices.map(p => p.price)) : 0,
        currency: 'TND',
        summary: summary || response,
        recommendation: prices.length ? 'Prices extracted from AI response.' : 'Could not parse prices. Try a more specific product name.',
      };
    }
  }

  async businessAdvisor(dto: BusinessAdvisorDto): Promise<BusinessAdvisorResultDto> {
    this.ensureApiKey();

    const businessContext = `
Business Data:
- Products: ${dto.totalProducts}
- Sales: ${dto.totalSales}
- Revenue: ${dto.revenue} TND
- Profit: ${dto.profit} TND
- Margin: ${dto.revenue > 0 ? ((dto.profit / dto.revenue) * 100).toFixed(1) : 0}%
- Low Stock: ${dto.lowStockCount}
- Out of Stock: ${dto.outOfStockCount}`;

    const question = dto.question || 'How can I improve my business?';

    const prompt = `You are a friendly business advisor for a phone shop in Tunisia.

Shop data:
${businessContext}

Question: ${question}

Consider Tunisia context: phone margins 10-25%, accessories 50-200%, Facebook Marketplace is key, seasonal trends.

Return ONLY this JSON:
{"analysis":"your analysis","strengths":["s1","s2","s3"],"weaknesses":["w1","w2","w3"],"recommendations":["r1","r2","r3"],"actionItems":["a1","a2","a3"]}

Be warm, encouraging, practical. At least 3 items each.`;

    const response = await this.callOpenRouter(prompt);

    try {
      const cleaned = this.extractJson(response);
      const parsed = JSON.parse(cleaned);
      return {
        analysis: parsed.analysis || '',
        strengths: parsed.strengths || [],
        weaknesses: parsed.weaknesses || [],
        recommendations: parsed.recommendations || [],
        actionItems: parsed.actionItems || [],
      };
    } catch {
      return {
        analysis: response,
        strengths: [],
        weaknesses: [],
        recommendations: [],
        actionItems: [],
      };
    }
  }

  private toNum(val: any): number {
    if (typeof val === 'number' && !isNaN(val)) return Math.round(val);
    if (typeof val === 'string') {
      const cleaned = val.replace(/[^0-9.\-]/g, '');
      const n = parseFloat(cleaned);
      return isNaN(n) ? 0 : Math.round(n);
    }
    return 0;
  }

  private extractJson(text: string): string {
    let cleaned = text.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) cleaned = fenceMatch[1].trim();
    const braceStart = cleaned.indexOf('{');
    const braceEnd = cleaned.lastIndexOf('}');
    if (braceStart !== -1 && braceEnd > braceStart) {
      cleaned = cleaned.substring(braceStart, braceEnd + 1);
    }
    return cleaned;
  }

  private extractPricesFromText(text: string): { shop: string; price: number; currency: string; notes?: string }[] {
    const results: { shop: string; price: number; currency: string; notes?: string }[] = [];
    const shopPattern = /["']?shop["']?\s*:\s*["']([^"']+)["']/gi;
    const pricePattern = /["']?price["']?\s*:\s*(\d+)/gi;
    const shops: string[] = [];
    const prices: number[] = [];
    let m;
    while ((m = shopPattern.exec(text)) !== null) shops.push(m[1]);
    while ((m = pricePattern.exec(text)) !== null) prices.push(parseInt(m[1]));
    for (let i = 0; i < Math.min(shops.length, prices.length); i++) {
      if (prices[i] > 0 && prices[i] < 100000) {
        results.push({ shop: shops[i], price: prices[i], currency: 'TND' });
      }
    }
    return results;
  }

  private extractSummaryFromText(text: string): string {
    const summaryMatch = text.match(/["']?summary["']?\s*:\s*["']([^"']+)["']/i);
    if (summaryMatch) return summaryMatch[1];
    const lines = text.split('\n').filter(l => l.trim().length > 20 && !l.includes('{') && !l.includes('"shop"'));
    return lines.slice(0, 3).join(' ').substring(0, 500);
  }

  private async callOpenRouter(prompt: string): Promise<string> {
    const models = [
      'nvidia/nemotron-3.5-lightning:free',
      'nvidia/nemotron-3-ultra-550b-a55b:free',
      'minimax/minimax-m3:free',
      'openrouter/free',
    ];

    let lastError = '';
    for (const model of models) {
      try {
        const response = await fetch(`${this.openrouterBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.openrouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://mobitechsoftware.com',
            'X-Title': 'MobiTech POS AI Agent',
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content: 'You are a helpful assistant. Respond ONLY in valid JSON, no extra text.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            max_tokens: 4000,
            temperature: 0.5,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          return data.choices?.[0]?.message?.content ?? '';
        }

        lastError = `${response.status}`;
        this.logger.warn(`Model ${model} returned ${response.status}`);
      } catch (err) {
        lastError = String(err);
        this.logger.warn(`Model ${model} failed: ${err}`);
      }
    }

    throw new BadRequestException(`All AI models failed. Last error: ${lastError}`);
  }

  private ensureApiKey() {
    if (!this.openrouterApiKey) {
      throw new BadRequestException('OpenRouter API key is not configured');
    }
  }
}
