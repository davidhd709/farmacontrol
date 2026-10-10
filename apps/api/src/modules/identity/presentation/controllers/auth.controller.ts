import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from '../../application/services/auth.service';
import { LoginDto, LoginValidationPipe } from '../dtos/login.dto';
import {
  LoginResponseDto,
  CurrentUserResponseDto,
  LogoutResponseDto,
} from '../dtos/auth-response.dto';
import {
  SESSION_COOKIE_NAME,
  getSessionCookieOptions,
  getClearSessionCookieOptions,
  extractTokenFromCookieHeader,
} from '../utils/session-cookie.util';
import { SessionAuthGuard, AuthenticatedUserContext } from '../guards/session-auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { InvalidCredentialsException } from '../../domain/exceptions/identity.exceptions';

import { Optional } from '@nestjs/common';
import { AuditService } from '../../../audit/application/services/audit.service';
import { SessionService } from '../../application/services/session.service';
import { RateLimiterService } from '../../../../common/services/rate-limiter.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Optional() private readonly auditService?: AuditService,
    @Optional() private readonly sessionService?: SessionService,
    @Optional() private readonly rateLimiterService?: RateLimiterService
  ) {}

  /**
   * POST /api/v1/auth/login
   * Valida credenciales, emite sesión opaca en cookie HttpOnly y devuelve datos públicos del usuario.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  public async login(
    @Body(LoginValidationPipe) loginDto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<LoginResponseDto> {
    // req.ip respeta TRUST_PROXY: detrás de Caddy es la IP real del cliente
    const clientIp = req.ip || req.socket?.remoteAddress || 'unknown-ip';
    const normalizedUsername = loginDto.username.toLowerCase().trim();
    // El bloqueo por cuenta es por IP+usuario: fallar desde un equipo no bloquea la cuenta
    // (p. ej. admin) en los demás. El límite por IP, más alto, frena probar muchas cuentas.
    const ipKey = `auth:ip:${clientIp}`;
    const userKey = `auth:ip-user:${clientIp}:${normalizedUsername}`;
    const maxAttempts = Number(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS) || 5;
    const maxIpAttempts = Number(process.env.AUTH_RATE_LIMIT_IP_MAX_ATTEMPTS) || 20;
    const windowMs = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;

    // 1. Verificación previa de bloqueo por intentos fallidos excesivos
    if (this.rateLimiterService) {
      const ipStatus = this.rateLimiterService.checkLimit(ipKey);
      if (ipStatus.blocked) {
        res.setHeader('Retry-After', ipStatus.retryAfterSeconds);
        throw new HttpException(
          `Demasiados intentos fallidos desde esta dirección IP. Intente de nuevo en ${ipStatus.retryAfterSeconds} segundos.`,
          HttpStatus.TOO_MANY_REQUESTS
        );
      }

      const userStatus = this.rateLimiterService.checkLimit(userKey);
      if (userStatus.blocked) {
        res.setHeader('Retry-After', userStatus.retryAfterSeconds);
        throw new HttpException(
          `Demasiados intentos fallidos para la cuenta '${loginDto.username}'. Intente de nuevo en ${userStatus.retryAfterSeconds} segundos.`,
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
    }

    try {
      const { user, rawToken, roles, permissions } = await this.authService.login(
        loginDto.username,
        loginDto.password
      );

      // Un login correcto limpia solo su par IP+usuario: no debe borrar los fallos
      // acumulados por la IP contra otras cuentas
      if (this.rateLimiterService) {
        this.rateLimiterService.reset(userKey);
      }

      // Establecer cookie HttpOnly segura con el rawToken
      res.cookie(
        SESSION_COOKIE_NAME,
        rawToken,
        getSessionCookieOptions()
      );

      if (this.auditService) {
        await this.auditService.recordEvent({
          userId: user.id,
          action: 'auth:login_success',
          entity: 'User',
          entityId: user.id,
          details: { username: user.username.value },
          ipAddress: req?.ip || null,
          correlationId: req?.correlationId || null,
        });
      }

      return {
        user: {
          id: user.id!,
          username: user.username.value,
          isActive: user.isActive,
          roles,
          permissions,
        },
        message: 'Inicio de sesión exitoso.',
      };
    } catch (err) {
      if (err instanceof InvalidCredentialsException) {
        let isBlocked = false;
        let retryAfter = 0;

        if (this.rateLimiterService) {
          const ipResult = this.rateLimiterService.recordAttempt(ipKey, maxIpAttempts, windowMs);
          const userResult = this.rateLimiterService.recordAttempt(userKey, maxAttempts, windowMs);

          if (ipResult.blocked || userResult.blocked) {
            isBlocked = true;
            retryAfter = Math.max(ipResult.retryAfterSeconds, userResult.retryAfterSeconds);
            res.setHeader('Retry-After', retryAfter);
          }
        }

        if (this.auditService) {
          await this.auditService.recordEvent({
            userId: null,
            action: isBlocked ? 'auth:brute_force_blocked' : 'auth:login_failure',
            entity: 'Auth',
            entityId: null,
            details: {
              attemptedUsername: loginDto.username,
              reason: isBlocked ? 'rate_limit_exceeded' : 'invalid_credentials',
              retryAfterSeconds: isBlocked ? retryAfter : undefined,
            },
            ipAddress: req?.ip || null,
            correlationId: req?.correlationId || null,
          });
        }

        if (isBlocked) {
          throw new HttpException(
            `Demasiados intentos fallidos de inicio de sesión. Bloqueo temporal activado por ${retryAfter} segundos.`,
            HttpStatus.TOO_MANY_REQUESTS
          );
        }

        throw new UnauthorizedException('Nombre de usuario o contraseña incorrectos.');
      }
      throw err;
    }
  }

  /**
   * POST /api/v1/auth/logout
   * Revoca la sesión en base de datos y borra la cookie en el navegador. Idempotente.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  public async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<LogoutResponseDto> {
    const rawToken = extractTokenFromCookieHeader(req.headers.cookie);

    let sessionUserId: string | null = null;
    let sessionId: string | null = null;

    if (rawToken) {
      if (this.sessionService) {
        const session = await this.sessionService.validateSession(rawToken, false);
        if (session) {
          sessionUserId = session.userId;
          sessionId = session.id ?? null;
        }
      }
      await this.authService.logout(rawToken);
    }

    if (this.auditService) {
      await this.auditService.recordEvent({
        userId: sessionUserId,
        action: 'auth:logout',
        entity: 'Session',
        entityId: sessionId,
        details: {},
        ipAddress: req?.ip || null,
        correlationId: req?.correlationId || null,
      });
    }

    // Limpiar la cookie en el cliente
    res.clearCookie(
      SESSION_COOKIE_NAME,
      getClearSessionCookieOptions()
    );

    return {
      message: 'Sesión cerrada correctamente.',
    };
  }

  /**
   * GET /api/v1/auth/me
   * Retorna información pública del usuario autenticado resuelto por SessionAuthGuard,
   * incluyendo sus roles activos y permisos consolidados (Cierre de F-17).
   */
  @Get('me')
  @UseGuards(SessionAuthGuard)
  public getMe(
    @CurrentUser() user: AuthenticatedUserContext
  ): CurrentUserResponseDto {
    return {
      user: {
        id: user.id,
        username: user.username,
        isActive: true,
        roles: user.roles,
        permissions: user.permissions,
      },
    };
  }
}
