import { RequestShapeValidationPipe } from '../../../../common/pagination/request-shape.pipe';
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
  ParseUUIDPipe,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { SYSTEM_PERMISSIONS } from '@farmacia/contracts';
import type {
  CreateSystemUserDto,
  SystemRoleItemDto,
  SystemUserListItemDto,
  UpdateSystemUserRolesDto,
  UpdateSystemUserStatusDto,
  ResetSystemUserPasswordDto,
  PasswordActionResponseDto,
} from '@farmacia/contracts';
import { UserManagementService } from '../../application/services/user-management.service';
import { SessionAuthGuard } from '../guards/session-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import type { AuthenticatedUserContext } from '../guards/session-auth.guard';
import { SESSION_COOKIE_NAME, getClearSessionCookieOptions } from '../utils/session-cookie.util';

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
    @Body(
      new RequestShapeValidationPipe({
        username: 'text',
        password: 'text',
        roles: 'stringArray',
        isActive: 'boolean?',
      }),
    )
    dto: CreateSystemUserDto,
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
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new RequestShapeValidationPipe({ isActive: 'boolean' })) dto: UpdateSystemUserStatusDto,
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
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new RequestShapeValidationPipe({ roles: 'stringArray' })) dto: UpdateSystemUserRolesDto,
  ): Promise<SystemUserListItemDto> {
    return this.userManagementService.updateUserRoles(id, dto.roles);
  }

  /** Restablece la clave de una cuenta desde el gestor de usuarios. */
  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(SYSTEM_PERMISSIONS.USERS_UPDATE)
  public async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new RequestShapeValidationPipe({ newPassword: 'text' })) dto: ResetSystemUserPasswordDto,
    @CurrentUser() actor: AuthenticatedUserContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PasswordActionResponseDto> {
    await this.userManagementService.resetPassword(id, dto.newPassword, actor.id);
    if (id === actor.id) res.clearCookie(SESSION_COOKIE_NAME, getClearSessionCookieOptions());
    return { message: 'Contraseña restablecida. Las sesiones anteriores fueron cerradas.' };
  }
}
