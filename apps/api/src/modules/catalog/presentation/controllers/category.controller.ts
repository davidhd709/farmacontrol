import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  SYSTEM_PERMISSIONS,
  CategoryDto,
  PaginatedResponse,
} from '@farmacia/contracts';
import { CategoryService } from '../../application/services/category.service';
import {
  CreateCategoryDto,
  CreateCategoryValidationPipe,
} from '../dtos/create-category.dto';
import {
  UpdateCategoryDto,
  UpdateCategoryValidationPipe,
} from '../dtos/update-category.dto';
import { SessionAuthGuard, AuthenticatedUserContext } from '../../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../../identity/presentation/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../identity/presentation/decorators/current-user.decorator';
import {
  CategoryNotFoundException,
  CategoryAlreadyExistsException,
  CategoryHasActiveProductsException,
} from '../../domain/exceptions/category.exceptions';

@Controller('categories')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  /**
   * POST /api/v1/categories
   * Crea una nueva categoría con nombre único y descripción opcional.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(SYSTEM_PERMISSIONS.CATEGORIES_MANAGE)
  public async create(
    @Body(CreateCategoryValidationPipe) dto: CreateCategoryDto,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request
  ): Promise<CategoryDto> {
    try {
      const category = await this.categoryService.createCategory(dto, {
        userId: user.id,
        ipAddress: req.ip || null,
        correlationId: req.correlationId || null,
      });

      return category.toDto();
    } catch (err) {
      if (err instanceof CategoryAlreadyExistsException) {
        throw new ConflictException(err.message);
      }
      if (err instanceof Error) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  /**
   * GET /api/v1/categories
   * Lista categorías con soporte para búsqueda, filtro por estado y paginación.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.CATEGORIES_READ)
  public async list(
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ): Promise<PaginatedResponse<CategoryDto>> {
    let parsedIsActive: boolean | undefined = undefined;
    if (isActive !== undefined && isActive !== '') {
      parsedIsActive = isActive === 'true' || isActive === '1';
    }

    const parsedPage = page ? parseInt(page, 10) : 1;
    const parsedPageSize = pageSize ? parseInt(pageSize, 10) : 20;

    return this.categoryService.listCategories({
      search,
      isActive: parsedIsActive,
      page: isNaN(parsedPage) ? 1 : parsedPage,
      pageSize: isNaN(parsedPageSize) ? 20 : parsedPageSize,
    });
  }

  /**
   * GET /api/v1/categories/:id
   * Obtiene el detalle de una categoría por su identificador UUID.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.CATEGORIES_READ)
  public async getById(@Param('id') id: string): Promise<CategoryDto> {
    try {
      const category = await this.categoryService.getCategoryById(id);
      return category.toDto();
    } catch (err) {
      if (err instanceof CategoryNotFoundException) {
        throw new NotFoundException(err.message);
      }
      throw err;
    }
  }

  /**
   * PUT /api/v1/categories/:id
   * Actualiza el nombre, descripción y/o estado de una categoría existente.
   */
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.CATEGORIES_MANAGE)
  public async update(
    @Param('id') id: string,
    @Body(UpdateCategoryValidationPipe) dto: UpdateCategoryDto,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request
  ): Promise<CategoryDto> {
    try {
      const category = await this.categoryService.updateCategory(id, dto, {
        userId: user.id,
        ipAddress: req.ip || null,
        correlationId: req.correlationId || null,
      });

      return category.toDto();
    } catch (err) {
      if (err instanceof CategoryNotFoundException) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof CategoryAlreadyExistsException) {
        throw new ConflictException(err.message);
      }
      if (err instanceof Error) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  /**
   * DELETE /api/v1/categories/:id
   * Inactiva lógicamente una categoría si no cuenta con productos activos asociados.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.CATEGORIES_MANAGE)
  public async delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request
  ): Promise<{ message: string; category: CategoryDto }> {
    try {
      const category = await this.categoryService.deactivateCategory(id, {
        userId: user.id,
        ipAddress: req.ip || null,
        correlationId: req.correlationId || null,
      });

      return {
        message: 'Categoría inactivada exitosamente.',
        category: category.toDto(),
      };
    } catch (err) {
      if (err instanceof CategoryNotFoundException) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof CategoryHasActiveProductsException) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
