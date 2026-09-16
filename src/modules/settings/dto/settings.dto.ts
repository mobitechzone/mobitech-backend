import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class SetSettingDto {
  @ApiProperty({ example: 'company.name' })
  @IsString()
  key: string;

  @ApiProperty({ example: 'MobiTech' })
  value: any;

  @ApiPropertyOptional({ example: 'COMPANY' })
  @IsOptional()
  @IsString()
  group?: string;
}

export class UpdateSettingsBulkDto {
  @ApiProperty({ type: Object })
  @IsObject()
  values: Record<string, any>;
}
