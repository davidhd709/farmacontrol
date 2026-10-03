import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ExpenseCategoriesService } from '../application/expense-categories.service';
import {
  ExpenseCategoryDto,
  CreateExpenseCategoryPayload,
  UpdateExpenseCategoryPayload,
  SYSTEM_PERMISSIONS,
} from '@farmacia/contracts';
import { SessionAuthGuard } from '../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../identity/presentation/decorators/require-permissions.decorator';

@Controller('expense-categories')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class ExpenseCategoriesController {
  constructor(private readonly service: ExpenseCategoriesService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.EXPENSES_READ)
  async findAll(@Query('includeInactive') includeInactive?: string): Promise<ExpenseCategoryDto[]> {
    return this.service.findAll(includeInactive === 'true');
  }

  @Get(':id')
  @RequirePermissions(SYSTEM_PERMISSIONS.EXPENSES_READ)
  async findById(@Param('id') id: string): Promise<ExpenseCategoryDto> {
    return this.service.findById(id);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.EXPENSES_MANAGE)
  async create(@Body() payload: CreateExpenseCategoryPayload): Promise<ExpenseCategoryDto> {
    return this.service.create(payload);
  }

  @Patch(':id')
  @RequirePermissions(SYSTEM_PERMISSIONS.EXPENSES_MANAGE)
  async update(
    @Param('id') id: string,
    @Body() payload: UpdateExpenseCategoryPayload,
  ): Promise<ExpenseCategoryDto> {
    return this.service.update(id, payload);
  }
}
