import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role, User } from '@prisma/client';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/categories.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Ip } from '@nestjs/common';

@ApiTags('Categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a category (admin only)' })
  create(@Body() dto: CreateCategoryDto, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.categoriesService.create(dto, actor, ip);
  }

  @Get()
  @ApiOperation({ summary: 'List categories' })
  findAll(@Query() query: PaginationDto) {
    return this.categoriesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a category with its products' })
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a category (admin only)' })
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.categoriesService.update(id, dto, actor, ip);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a category (admin only)' })
  remove(@Param('id') id: string, @CurrentUser() actor: User, @Ip() ip: string) {
    return this.categoriesService.remove(id, actor, ip);
  }
}
