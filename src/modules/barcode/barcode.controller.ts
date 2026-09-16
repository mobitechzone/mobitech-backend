import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { generateEan13, isValidEan13, generateSku, ean13CheckDigit } from '../../common/utils/barcode.utils';

@ApiTags('Barcode')
@Controller('barcode')
export class BarcodeController {
  @Get('generate')
  @ApiOperation({ summary: 'Generate a new EAN-13 barcode' })
  generate() {
    const code = generateEan13();
    return { barcode: code, valid: isValidEan13(code) };
  }

  @Get('sku')
  @ApiOperation({ summary: 'Generate a new product SKU' })
  generateSku() {
    return { sku: generateSku() };
  }

  @Get('validate/:code')
  @ApiOperation({ summary: 'Validate an EAN-13 barcode' })
  validate(@Param('code') code: string) {
    return { barcode: code, valid: isValidEan13(code), checkDigit: code.length === 13 ? ean13CheckDigit(code.slice(0, 12)) : null };
  }
}
