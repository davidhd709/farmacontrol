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
  type ProductPresentationDto,
  SYSTEM_PERMISSIONS,
} from '@farmacia/contracts';
import { ProductPresentationService } from '../../application/services/product-presentation.service';
import {
  CreateProductPresentationDto,
  CreateProductPresentationValidationPipe,
} from '../dtos/create-product-presentation.dto';
import {
  UpdateProductPresentationDto,
  UpdateProductPresentationValidationPipe,
} from '../dtos/update-product-presentation.dto';
import {
  type AuthenticatedUserContext,
  SessionAuthGuard,
} from '../../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../../identity/presentation/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../identity/presentation/decorators/current-user.decorator';
import { ProductNotFoundException } from '../../domain/exceptions/product.exceptions';
import {
  CannotDeactivateDefaultPresentationException,
  ProductPresentationBarcodeAlreadyExistsException,
  ProductPresentationNameAlreadyExistsException,
  ProductPresentationNotFoundException,
} from '../../domain/exceptions/product-presentation.exceptions';

@Controller('products/:productId/presentations')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class ProductPresentationController {
  constructor(private readonly presentationService: ProductPresentationService) {}

  /**
   * POST /api/v1/products/:productId/presentations
   * Registra una presentación comercial asociada al producto.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(SYSTEM_PERMISSIONS.PRODUCTS_MANAGE)
  public async create(
    @Param('productId') productId: string,
    @Body(CreateProductPresentationValidationPipe) dto: CreateProductPresentationDto,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request,
  ): Promise<ProductPresentationDto> {
    try {
      const presentation = await this.presentationService.createPresentation(
        productId,
        dto,
        {
          userId: user.id,
          ipAddress: req.ip || null,
          correlationId: req.correlationId || null,
        },
      );

      return presentation.toDto();
    } catch (err) {
      if (err instanceof ProductNotFoundException) {
        throw new NotFoundException(err.message);
      }
      if (
        err instanceof ProductPresentationNameAlreadyExistsException ||
        err instanceof ProductPresentationBarcodeAlreadyExistsException
      ) {
        throw new ConflictException(err.message);
      }
      if (err instanceof Error) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  /**
   * GET /api/v1/products/:productId/presentations
   * Lista todas las presentaciones comerciales configuradas para el producto.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.PRODUCTS_READ)
  public async list(
    @Param('productId') productId: string,
    @Query('isActive') isActive?: string,
  ): Promise<ProductPresentationDto[]> {
    try {
      let parsedIsActive: boolean | undefined;
      if (isActive === 'true') parsedIsActive = true;
      if (isActive === 'false') parsedIsActive = false;

      return await this.presentationService.getPresentationsByProductId(productId, {
        isActive: parsedIsActive,
      });
    } catch (err) {
      if (err instanceof ProductNotFoundException) {
        throw new NotFoundException(err.message);
      }
      throw err;
    }
  }

  /**
   * GET /api/v1/products/:productId/presentations/:id
   * Obtiene el detalle de una presentación comercial.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.PRODUCTS_READ)
  public async getById(
    @Param('productId') productId: string,
    @Param('id') id: string,
  ): Promise<ProductPresentationDto> {
    try {
      const presentation = await this.presentationService.getPresentationById(productId, id);
      return presentation.toDto();
    } catch (err) {
      if (err instanceof ProductPresentationNotFoundException) {
        throw new NotFoundException(err.message);
      }
      throw err;
    }
  }

  /**
   * PUT /api/v1/products/:productId/presentations/:id
   * Actualiza los datos o factores de una presentación comercial.
   */
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.PRODUCTS_MANAGE)
  public async update(
    @Param('productId') productId: string,
    @Param('id') id: string,
    @Body(UpdateProductPresentationValidationPipe) dto: UpdateProductPresentationDto,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request,
  ): Promise<ProductPresentationDto> {
    try {
      const presentation = await this.presentationService.updatePresentation(
        productId,
        id,
        dto,
        {
          userId: user.id,
          ipAddress: req.ip || null,
          correlationId: req.correlationId || null,
        },
      );

      return presentation.toDto();
    } catch (err) {
      if (
        err instanceof ProductNotFoundException ||
        err instanceof ProductPresentationNotFoundException
      ) {
        throw new NotFoundException(err.message);
      }
      if (
        err instanceof ProductPresentationNameAlreadyExistsException ||
        err instanceof ProductPresentationBarcodeAlreadyExistsException
      ) {
        throw new ConflictException(err.message);
      }
      if (err instanceof CannotDeactivateDefaultPresentationException) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof Error) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  /**
   * DELETE /api/v1/products/:productId/presentations/:id
   * Inactiva lógicamente una presentación comercial.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.PRODUCTS_MANAGE)
  public async deactivate(
    @Param('productId') productId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request,
  ): Promise<ProductPresentationDto> {
    try {
      const presentation = await this.presentationService.deactivatePresentation(
        productId,
        id,
        {
          userId: user.id,
          ipAddress: req.ip || null,
          correlationId: req.correlationId || null,
        },
      );

      return presentation.toDto();
    } catch (err) {
      if (err instanceof ProductPresentationNotFoundException) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof CannotDeactivateDefaultPresentationException) {
        throw new BadRequestException(err.message);
      }
      if (err instanceof Error) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  /**
   * POST /api/v1/products/:productId/presentations/:id/convert
   * Convierte cantidades entre presentación comercial y unidad base (RN-004).
   */
  @Post(':id/convert')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.PRODUCTS_READ)
  public async convert(
    @Param('productId') productId: string,
    @Param('id') id: string,
    @Body() body: { quantity: number; direction: 'toBase' | 'fromBase' },
  ) {
    if (!body || typeof body.quantity !== 'number' || isNaN(body.quantity)) {
      throw new BadRequestException('El campo "quantity" es obligatorio y debe ser un número.');
    }
    if (body.direction !== 'toBase' && body.direction !== 'fromBase') {
      throw new BadRequestException('El campo "direction" debe ser "toBase" o "fromBase".');
    }

    try {
      return await this.presentationService.convertUnits(
        productId,
        id,
        body.quantity,
        body.direction,
      );
    } catch (err) {
      if (err instanceof ProductPresentationNotFoundException) {
        throw new NotFoundException(err.message);
      }
      if (err instanceof Error) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }
}
