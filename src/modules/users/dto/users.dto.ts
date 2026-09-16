import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role, UserStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsBoolean,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'Karim Ben Ali' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'karim@mobitech.tn' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+216 22 123 456' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: '12345678' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;

  @ApiProperty({ enum: Role, example: Role.EMPLOYEE })
  @IsIn([Role.ADMIN, Role.EMPLOYEE])
  role: Role;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canDiscount?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canCustomPrice?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canRefund?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canEditOwnRepairs?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canViewProfit?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canHoldSale?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canDeleteSale?: boolean;
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsIn([Role.ADMIN, Role.EMPLOYEE])
  role?: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canDiscount?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canCustomPrice?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canRefund?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canEditOwnRepairs?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canViewProfit?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canHoldSale?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  canDeleteSale?: boolean;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'newpassword123' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  newPassword: string;
}

export class QueryUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
