import { Module } from '@nestjs/common';
import { PASSWORD_HASHER_PORT } from './application/ports/password-hasher.port';
import { USER_REPOSITORY_PORT } from './application/ports/user.repository.port';
import { SESSION_TOKEN_PORT } from './application/ports/session-token.port';
import { SESSION_REPOSITORY_PORT } from './application/ports/session.repository.port';
import { RBAC_REPOSITORY_PORT } from './application/ports/rbac.repository.port';
import { Argon2PasswordHasherAdapter } from './infrastructure/adapters/argon2-password-hasher.adapter';
import { PrismaUserRepository } from './infrastructure/adapters/prisma-user.repository';
import { CryptoSessionTokenAdapter } from './infrastructure/adapters/crypto-session-token.adapter';
import { PrismaSessionRepository } from './infrastructure/adapters/prisma-session.repository';
import { PrismaRbacRepository } from './infrastructure/adapters/prisma-rbac.repository';
import { PasswordService } from './application/services/password.service';
import { UserProvisioningService } from './application/services/user-provisioning.service';
import { SessionService } from './application/services/session.service';
import { AuthService } from './application/services/auth.service';
import { UserManagementService } from './application/services/user-management.service';
import { SessionAuthGuard } from './presentation/guards/session-auth.guard';
import { PermissionsGuard } from './presentation/guards/permissions.guard';
import { AuthController } from './presentation/controllers/auth.controller';
import { UsersController } from './presentation/controllers/users.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [AuthController, UsersController],
  providers: [
    {
      provide: PASSWORD_HASHER_PORT,
      useClass: Argon2PasswordHasherAdapter,
    },
    {
      provide: USER_REPOSITORY_PORT,
      useClass: PrismaUserRepository,
    },
    {
      provide: SESSION_TOKEN_PORT,
      useClass: CryptoSessionTokenAdapter,
    },
    {
      provide: SESSION_REPOSITORY_PORT,
      useClass: PrismaSessionRepository,
    },
    {
      provide: RBAC_REPOSITORY_PORT,
      useClass: PrismaRbacRepository,
    },
    PasswordService,
    UserProvisioningService,
    UserManagementService,
    SessionService,
    AuthService,
    SessionAuthGuard,
    PermissionsGuard,
  ],
  exports: [
    PASSWORD_HASHER_PORT,
    USER_REPOSITORY_PORT,
    SESSION_TOKEN_PORT,
    SESSION_REPOSITORY_PORT,
    RBAC_REPOSITORY_PORT,
    PasswordService,
    UserProvisioningService,
    SessionService,
    AuthService,
    SessionAuthGuard,
    PermissionsGuard,
  ],
})
export class IdentityModule {}


