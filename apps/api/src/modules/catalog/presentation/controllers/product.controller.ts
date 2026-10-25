import { QueryFieldValidationPipe } from '../../../../common/pagination/request-shape.pipe';
import { parsePaginationValue } from '../../../../common/pagination/pagination';
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
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  INVENTORY_CONTROL_MODES,
  type InventoryControlMode,
  type PaginatedResponse,
  type ProductDto,
  type ProductSettingsDto,
  SYSTEM_PERMISSIONS,
} from '@farmacia/contracts';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ProductService } from '../../application/services/product.service';
import { CreateProductDto, CreateProductValidationPipe } from '../dtos/create-product.dto';
import { UpdateProductDto, UpdateProductValidationPipe } from '../dtos/update-product.dto';
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
@ApiTags('products')
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
      throw err;
    }
  }

  /**
   * GET /api/v1/products
   * Consulta productos con búsqueda textual, filtro por categoría y modo de inventario.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.PRODUCTS_READ)
  @ApiQuery({ name: 'inventoryControlMode', required: false, enum: INVENTORY_CONTROL_MODES })
  public async list(
    @Query('search', new QueryFieldValidationPipe('search', 'text?')) search?: string,
    @Query('categoryId', new QueryFieldValidationPipe('categoryId', 'uuid?')) categoryId?: string,
    @Query('inventoryControlMode', new QueryFieldValidationPipe('inventoryControlMode', 'text?'))
    inventoryControlMode?: string,
    @Query('isActive', new QueryFieldValidationPipe('isActive', 'booleanString?'))
    isActive?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<PaginatedResponse<ProductDto>> {
    let parsedIsActive: boolean | undefined;
    if (isActive === 'true') parsedIsActive = true;
    if (isActive === 'false') parsedIsActive = false;

    if (
      inventoryControlMode !== undefined &&
      !INVENTORY_CONTROL_MODES.includes(inventoryControlMode as InventoryControlMode)
    ) {
      throw new BadRequestException('El filtro "inventoryControlMode" no es válido.');
    }

    const parsedPage = parsePaginationValue(page, 'page');
    const parsedPageSize = parsePaginationValue(pageSize, 'pageSize');

    return this.productService.listProducts({
      search,
      categoryId,
      inventoryControlMode: inventoryControlMode as InventoryControlMode | undefined,
      isActive: parsedIsActive,
      page: parsedPage,
      pageSize: parsedPageSize,
    });
  }

  @Get('settings')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.PRODUCTS_READ)
  @ApiOperation({ summary: 'Reglas sectoriales para crear y editar productos' })
  @ApiOkResponse({ description: 'Perfil sectorial y modos de control permitidos.' })
  public async getSettings(): Promise<ProductSettingsDto> {
    return this.productService.getProductSettings();
  }

  /**
   * GET /api/v1/products/:id
   * Obtiene el detalle de un producto por su ID.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.PRODUCTS_READ)
  public async getById(@Param('id', ParseUUIDPipe) id: string): Promise<ProductDto> {
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
    @Param('id', ParseUUIDPipe) id: string,
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
    @Param('id', ParseUUIDPipe) id: string,
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
      throw err;
    }
  }
}
