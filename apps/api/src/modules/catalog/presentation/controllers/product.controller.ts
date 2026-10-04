import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  type PaginatedResponse,
  type ProductDto,
  SYSTEM_PERMISSIONS,
} from '@farmacia/contracts';
import { ProductService } from '../../application/services/product.service';
import {
  CreateProductDto,
  CreateProductValidationPipe,
} from '../dtos/create-product.dto';
import {
  UpdateProductDto,
  UpdateProductValidationPipe,
} from '../dtos/update-product.dto';
import {
  type AuthenticatedUserContext,
  SessionAuthGuard,
} from '../../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../../identity/presentation/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../identity/presentation/decorators/current-user.decorator';
import {
  ProductBarcodeAlreadyExistsException,
  ProductCategoryNotFoundException,
  ProductCodeAlreadyExistsException,
  ProductNotFoundException,
} from '../../domain/exceptions/product.exceptions';

@Controller('products')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  /**
   * POST /api/v1/products
   * Registra un nuevo producto con atributos farmacéuticos y control de unicidad.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(SYSTEM_PERMISSIONS.PRODUCTS_MANAGE)
  public async create(
    @Body(CreateProductValidationPipe) dto: CreateProductDto,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request,
  ): Promise<ProductDto> {
    try {
      const product = await this.productService.createProduct(dto, {
        userId: user.id,
        ipAddress: req.ip || null,
        correlationId: req.correlationId || null,
      });

      return product.toDto();
    } catch (err) {
      if (
        err instanceof ProductCodeAlreadyExistsException ||
        err instanceof ProductBarcodeAlreadyExistsException
      ) {
        throw new ConflictException(err.message);
      }
      if (err instanceof ProductCategoryNotFoundException) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof Error) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  /**
   * GET /api/v1/products
   * Consulta productos con soporte para búsqueda textual, filtro por categoría, lotes y paginación.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.PRODUCTS_READ)
  public async list(
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('requiresLotControl') requiresLotControl?: string,
    @Query('isActive') isActive?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<PaginatedResponse<ProductDto>> {
    let parsedIsActive: boolean | undefined;
    if (isActive === 'true') parsedIsActive = true;
    if (isActive === 'false') parsedIsActive = false;

    let parsedRequiresLotControl: boolean | undefined;
    if (requiresLotControl === 'true') parsedRequiresLotControl = true;
    if (requiresLotControl === 'false') parsedRequiresLotControl = false;

    const parsedPage = page ? parseInt(page, 10) : undefined;
    const parsedPageSize = pageSize ? parseInt(pageSize, 10) : undefined;

    return this.productService.listProducts({
      search,
      categoryId,
      requiresLotControl: parsedRequiresLotControl,
      isActive: parsedIsActive,
      page: parsedPage,
      pageSize: parsedPageSize,
    });
  }

  /**
   * GET /api/v1/products/:id
   * Obtiene el detalle de un producto por su ID.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.PRODUCTS_READ)
  public async getById(@Param('id') id: string): Promise<ProductDto> {
    try {
      return await this.productService.getProductDtoById(id);
    } catch (err) {
      if (err instanceof ProductNotFoundException) {
        throw new NotFoundException(err.message);
      }
      throw err;
    }
  }

  /**
   * PUT /api/v1/products/:id
   * Actualiza los datos de un producto.
   */
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.PRODUCTS_MANAGE)
  public async update(
    @Param('id') id: string,
    @Body(UpdateProductValidationPipe) dto: UpdateProductDto,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request,
  ): Promise<ProductDto> {
    try {
      const product = await this.productService.updateProduct(id, dto, {
        userId: user.id,
        ipAddress: req.ip || null,
        correlationId: req.correlationId || null,
      });

      return product.toDto();
    } catch (err) {
      if (err instanceof ProductNotFoundException) {
        throw new NotFoundException(err.message);
      }
      if (
        err instanceof ProductCodeAlreadyExistsException ||
        err instanceof ProductBarcodeAlreadyExistsException
      ) {
        throw new ConflictException(err.message);
      }
      if (err instanceof ProductCategoryNotFoundException) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof Error) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  /**
   * DELETE /api/v1/products/:id
   * Inactiva lógicamente un producto del catálogo.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.PRODUCTS_MANAGE)
  public async deactivate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request,
  ): Promise<ProductDto> {
    try {
      const product = await this.productService.deactivateProduct(id, {
        userId: user.id,
        ipAddress: req.ip || null,
        correlationId: req.correlationId || null,
      });

      return product.toDto();
    } catch (err) {
      if (err instanceof ProductNotFoundException) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof Error) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
