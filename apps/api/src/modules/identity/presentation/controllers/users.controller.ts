import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import type {
  CreateSystemUserDto,
  SystemRoleItemDto,
  SystemUserListItemDto,
  UpdateSystemUserRolesDto,
  UpdateSystemUserStatusDto,
} from '@farmacia/contracts';
import { UserManagementService } from '../../application/services/user-management.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/require-permissions.decorator';

@Controller('users')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly userManagementService: UserManagementService) {}

  /**
   * GET /api/v1/users
   * Lista todos los usuarios del sistema con sus roles asociados.
   */
  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.USERS_READ)
  public async listUsers(): Promise<SystemUserListItemDto[]> {
    return this.userManagementService.listUsers();
  }

  /**
   * GET /api/v1/users/roles
   * Lista los roles disponibles en el sistema para asignación.
   */
  @Get('roles')
  @RequirePermissions(SYSTEM_PERMISSIONS.ROLES_READ)
  public async listRoles(): Promise<SystemRoleItemDto[]> {
    return this.userManagementService.listRoles();
  }

  /**
   * POST /api/v1/users
   * Crea un nuevo usuario y le asigna roles.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(SYSTEM_PERMISSIONS.USERS_CREATE)
  public async createUser(
    @Body() dto: CreateSystemUserDto
  ): Promise<SystemUserListItemDto> {
    return this.userManagementService.createUser(dto);
  }

  /**
   * PATCH /api/v1/users/:id/status
   * Activa o desactiva un usuario.
   */
  @Patch(':id/status')
  @RequirePermissions(SYSTEM_PERMISSIONS.USERS_UPDATE)
  public async updateUserStatus(
    @Param('id') id: string,
    @Body() dto: UpdateSystemUserStatusDto
  ): Promise<SystemUserListItemDto> {
    return this.userManagementService.updateUserStatus(id, dto.isActive);
  }

  /**
   * PATCH /api/v1/users/:id/roles
   * Reasigna la lista de roles para un usuario.
   */
  @Patch(':id/roles')
  @RequirePermissions(SYSTEM_PERMISSIONS.ROLES_ASSIGN)
  public async updateUserRoles(
    @Param('id') id: string,
    @Body() dto: UpdateSystemUserRolesDto
  ): Promise<SystemUserListItemDto> {
    return this.userManagementService.updateUserRoles(id, dto.roles);
  }
}
