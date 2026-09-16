import { Module } from '@nestjs/common';
import { BarcodeController } from './barcode.controller';

@Module({
  controllers: [BarcodeController],
})
export class BarcodeModule {}
