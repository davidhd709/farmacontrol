import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
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
  ThirdPartyDto,
  ThirdPartyQueryFilters,
  PaginatedResponse,
} from '@farmacia/contracts';
import { ThirdPartyService } from '../../application/third-party.service';
import {
  CreateThirdPartyDto,
  CreateThirdPartyValidationPipe,
} from '../dtos/create-third-party.dto';
import {
  UpdateThirdPartyDto,
  UpdateThirdPartyValidationPipe,
} from '../dtos/update-third-party.dto';
import { ThirdPartyQueryValidationPipe } from '../dtos/third-party-query.dto';
import {
  SessionAuthGuard,
  AuthenticatedUserContext,
} from '../../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../../identity/presentation/decorators/require-permissions.decorator';
import { CurrentUser } from '../../../identity/presentation/decorators/current-user.decorator';
import {
  ThirdPartyNotFoundException,
  ThirdPartyAlreadyExistsException,
  ThirdPartyDocumentChangeForbiddenException,
} from '../../domain/third-party.exceptions';

@Controller('third-parties')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class ThirdPartyController {
  constructor(private readonly thirdPartyService: ThirdPartyService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(SYSTEM_PERMISSIONS.THIRD_PARTIES_MANAGE)
  public async create(
    @Body(CreateThirdPartyValidationPipe) dto: CreateThirdPartyDto,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request,
  ): Promise<ThirdPartyDto> {
    try {
      const thirdParty = await this.thirdPartyService.createThirdParty(dto, {
        userId: user.id,
        ipAddress: req.ip,
        correlationId: req.headers['x-correlation-id'] as string | undefined,
      });
      return thirdParty.toDto();
    } catch (error) {
      if (error instanceof ThirdPartyAlreadyExistsException) {
        throw new ConflictException(error.message);
      }
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.THIRD_PARTIES_READ)
  public async findPaginated(
    @Query(ThirdPartyQueryValidationPipe) filters: ThirdPartyQueryFilters,
  ): Promise<PaginatedResponse<ThirdPartyDto>> {
    return this.thirdPartyService.findPaginated(filters);
  }

  @Get(':id')
  @RequirePermissions(SYSTEM_PERMISSIONS.THIRD_PARTIES_READ)
  public async getById(@Param('id') id: string): Promise<ThirdPartyDto> {
    try {
      const thirdParty = await this.thirdPartyService.getThirdPartyById(id);
      return thirdParty.toDto();
    } catch (error) {
      if (error instanceof ThirdPartyNotFoundException) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  @Put(':id')
  @RequirePermissions(SYSTEM_PERMISSIONS.THIRD_PARTIES_MANAGE)
  public async update(
    @Param('id') id: string,
    @Body(UpdateThirdPartyValidationPipe) dto: UpdateThirdPartyDto,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request,
  ): Promise<ThirdPartyDto> {
    try {
      const thirdParty = await this.thirdPartyService.updateThirdParty(id, dto, {
        userId: user.id,
        ipAddress: req.ip,
        correlationId: req.headers['x-correlation-id'] as string | undefined,
      });
      return thirdParty.toDto();
    } catch (error) {
      if (error instanceof ThirdPartyNotFoundException) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof ThirdPartyDocumentChangeForbiddenException) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof Error) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  @Patch(':id/deactivate')
  @RequirePermissions(SYSTEM_PERMISSIONS.THIRD_PARTIES_MANAGE)
  public async deactivate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request,
  ): Promise<ThirdPartyDto> {
    try {
      const thirdParty = await this.thirdPartyService.deactivateThirdParty(id, {
        userId: user.id,
        ipAddress: req.ip,
        correlationId: req.headers['x-correlation-id'] as string | undefined,
      });
      return thirdParty.toDto();
    } catch (error) {
      if (error instanceof ThirdPartyNotFoundException) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }

  @Patch(':id/activate')
  @RequirePermissions(SYSTEM_PERMISSIONS.THIRD_PARTIES_MANAGE)
  public async activate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() req: Request,
  ): Promise<ThirdPartyDto> {
    try {
      const thirdParty = await this.thirdPartyService.activateThirdParty(id, {
        userId: user.id,
        ipAddress: req.ip,
        correlationId: req.headers['x-correlation-id'] as string | undefined,
      });
      return thirdParty.toDto();
    } catch (error) {
      if (error instanceof ThirdPartyNotFoundException) {
        throw new NotFoundException(error.message);
      }
      throw error;
    }
  }
}
