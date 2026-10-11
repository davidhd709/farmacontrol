import {
  RequestShapeValidationPipe,
  QueryFieldValidationPipe,
} from '../../../../common/pagination/request-shape.pipe';
import { parsePaginationValue } from '../../../../common/pagination/pagination';
import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  SYSTEM_PERMISSIONS,
  UnitOfMeasureDto,
  CreateUnitOfMeasurePayload,
  UpdateUnitOfMeasurePayload,
  PaginatedResponse,
} from '@farmacia/contracts';
import { UnitOfMeasureService } from '../../application/services/unit-of-measure.service';
import { SessionAuthGuard } from '../../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../../identity/presentation/decorators/require-permissions.decorator';

@Controller('units-of-measure')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class UnitOfMeasureController {
  constructor(private readonly service: UnitOfMeasureService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(SYSTEM_PERMISSIONS.CATEGORIES_MANAGE)
  public async create(
    @Body(
      new RequestShapeValidationPipe({
        code: 'text',
        name: 'text',
        description: 'text?',
        category: 'text?',
      }),
    )
    body: CreateUnitOfMeasurePayload,
  ): Promise<UnitOfMeasureDto> {
    if (!body.code || !body.code.trim()) {
      throw new BadRequestException('El código de la unidad de medida es obligatorio.');
    }
    if (!body.name || !body.name.trim()) {
      throw new BadRequestException('El nombre de la unidad de medida es obligatorio.');
    }

    const unit = await this.service.create(body);
    return unit.toDto();
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.CATEGORIES_READ)
  public async list(
    @Query('search', new QueryFieldValidationPipe('search', 'text?')) search?: string,
    @Query('category', new QueryFieldValidationPipe('category', 'text?')) category?: string,
    @Query('isActive', new QueryFieldValidationPipe('isActive', 'booleanString?'))
    isActive?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<PaginatedResponse<UnitOfMeasureDto>> {
    let parsedIsActive: boolean | undefined = undefined;
    if (isActive !== undefined && isActive !== '') {
      parsedIsActive = isActive === 'true' || isActive === '1';
    }

    return this.service.list({
      search,
      category,
      isActive: parsedIsActive,
      page: parsePaginationValue(page, 'page', 1),
      pageSize: parsePaginationValue(pageSize, 'pageSize', 50),
    });
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.CATEGORIES_READ)
  public async getById(@Param('id', ParseUUIDPipe) id: string): Promise<UnitOfMeasureDto> {
    const unit = await this.service.findById(id);
    return unit.toDto();
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.CATEGORIES_MANAGE)
  public async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(
      new RequestShapeValidationPipe({
        name: 'text?',
        description: 'text?',
        category: 'text?',
        isActive: 'boolean?',
      }),
    )
    body: UpdateUnitOfMeasurePayload,
  ): Promise<UnitOfMeasureDto> {
    const unit = await this.service.update(id, body);
    return unit.toDto();
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.CATEGORIES_MANAGE)
  public async deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<UnitOfMeasureDto> {
    const unit = await this.service.deactivate(id);
    return unit.toDto();
  }
}
