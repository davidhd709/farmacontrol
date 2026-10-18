import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, RequestMethod } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import request from 'supertest';
import { prisma, cleanTestDatabase, seedRbac } from '@farmacia/database';
import { SYSTEM_ROLES } from '@farmacia/contracts';
import { AppModule } from '../../src/app.module';
import { SessionAuthGuard } from '../../src/modules/identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../src/modules/identity/presentation/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../src/modules/identity/presentation/decorators/require-permissions.decorator';
import { Argon2PasswordHasherAdapter } from '../../src/modules/identity/infrastructure/adapters/argon2-password-hasher.adapter';
import { PrismaUserRepository } from '../../src/modules/identity/infrastructure/adapters/prisma-user.repository';
import { User } from '../../src/modules/identity/domain/entities/user.entity';
import { Username } from '../../src/modules/identity/domain/value-objects/username.vo';

/**
 * Matriz endpoint × rol generada desde los metadatos reales de Nest: cada ruta nueva queda
 * cubierta sin escribir una prueba. Para cada rol del seed se comprueba que el API responde
 * 403 exactamente cuando al rol le falta algún permiso exigido, y que toda ruta no pública
 * pide sesión. Las llamadas denegadas no tienen efectos (el guard corta antes de validar);
 * las permitidas solo se prueban con GET.
 */

/** Rutas que deben responder sin sesión. Cualquier otra ruta sin SessionAuthGuard falla. */
const PUBLIC_ROUTES = new Set([
  'GET /api/v1/health',
  'POST /api/v1/auth/login',
  // Cerrar sesión sin sesión solo borra la cookie: no expone ni modifica datos
  'POST /api/v1/auth/logout',
]);

/** Rutas con sesión pero sin permiso específico (cualquier usuario autenticado). */
const SESSION_ONLY_ROUTES = new Set(['GET /api/v1/auth/me', 'GET /api/v1/alerts/summary']);

interface RouteInfo {
  method: string;
  path: string;
  key: string;
  permissions: string[];
  hasSession: boolean;
}

const FAKE_ID = '00000000-0000-4000-8000-000000000000';
const PASSWORD = 'Matriz#Permisos2026';

function joinPath(...parts: string[]): string {
  return (
    '/' +
    parts
      .flatMap((part) => part.split('/'))
      .filter(Boolean)
      .join('/')
  );
}

function collectRoutes(module: TestingModule): RouteInfo[] {
  const discovery = module.get(DiscoveryService);
  const scanner = module.get(MetadataScanner);
  const reflector = module.get(Reflector);
  const routes: RouteInfo[] = [];

  for (const wrapper of discovery.getControllers()) {
    const { instance, metatype } = wrapper;
    if (!instance || !metatype) continue;
    const prototype = Object.getPrototypeOf(instance);
    const controllerPaths = [Reflect.getMetadata(PATH_METADATA, metatype) ?? ''].flat() as string[];
    const classGuards = (Reflect.getMetadata(GUARDS_METADATA, metatype) ?? []) as unknown[];

    for (const methodName of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[methodName];
      const methodPath = Reflect.getMetadata(PATH_METADATA, handler);
      const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as
        RequestMethod | undefined;
      if (methodPath === undefined || requestMethod === undefined) continue;

      const guards = [
        ...classGuards,
        ...((Reflect.getMetadata(GUARDS_METADATA, handler) ?? []) as unknown[]),
      ];
      const permissions =
        reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [handler, metatype]) ?? [];
      const hasPermissionGuard = guards.includes(PermissionsGuard);

      for (const controllerPath of controllerPaths) {
        for (const subPath of [methodPath].flat() as string[]) {
          const method = RequestMethod[requestMethod];
          const path = joinPath('api/v1', controllerPath, subPath);
          routes.push({
            method,
            path,
            key: `${method} ${path}`,
            // Sin PermissionsGuard el decorador no tendría efecto: se trata como sin permiso
            permissions: hasPermissionGuard ? permissions : [],
            hasSession: guards.includes(SessionAuthGuard),
          });
        }
      }
    }
  }
  return routes;
}

function concretePath(path: string): string {
  return path.replace(/:[A-Za-z]+/g, FAKE_ID);
}

function send(app: INestApplication, route: RouteInfo, cookie?: string[]) {
  const server = request(app.getHttpServer());
  const url = concretePath(route.path);
  const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
  let req = server[method](url);
  if (cookie) req = req.set('Cookie', cookie);
  return method === 'get' || method === 'delete' ? req : req.send({});
}

describe('Matriz de autorización endpoint × rol (PostgreSQL real)', () => {
  let app: INestApplication;
  let moduleFixture: TestingModule;
  let routes: RouteInfo[];
  const rolePermissions = new Map<string, Set<string>>();
  const roleCookies = new Map<string, string[]>();

  beforeAll(async () => {
    await cleanTestDatabase();
    await seedRbac(prisma);

    moduleFixture = await Test.createTestingModule({
      imports: [AppModule, DiscoveryModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    routes = collectRoutes(moduleFixture);

    const hasher = new Argon2PasswordHasherAdapter({
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
      hashLength: 32,
    });
    const users = new PrismaUserRepository(prisma);
    const passwordHash = await hasher.hash(PASSWORD);

    for (const roleName of Object.values(SYSTEM_ROLES)) {
      const role = await prisma.role.findUniqueOrThrow({
        where: { name: roleName },
        include: { rolePermissions: { include: { permission: true } } },
      });
      rolePermissions.set(roleName, new Set(role.rolePermissions.map((rp) => rp.permission.name)));

      const user = await users.create(
        User.create({
          username: Username.create(`matriz_${roleName}`),
          passwordHash,
          isActive: true,
        }),
      );
      await prisma.userRole.create({ data: { userId: user.id!, roleId: role.id } });
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: `matriz_${roleName}`, password: PASSWORD })
        .expect(200);
      roleCookies.set(roleName, login.headers['set-cookie'] as unknown as string[]);
    }
  }, 120000);

  afterAll(async () => {
    if (app) await app.close();
    await cleanTestDatabase();
  }, 30000);

  it('descubre las rutas de todos los módulos', () => {
    expect(routes.length).toBeGreaterThan(100);
    expect(routes.map((r) => r.key)).toContain('POST /api/v1/sales/confirm');
  });

  it('toda ruta sin sesión es pública a propósito, y toda ruta con sesión rechaza 401 sin cookie', async () => {
    const unexpectedPublic = routes
      .filter((r) => !r.hasSession && !PUBLIC_ROUTES.has(r.key))
      .map((r) => r.key);
    expect(unexpectedPublic).toEqual([]);

    const notRejected: string[] = [];
    for (const route of routes.filter((r) => r.hasSession)) {
      const res = await send(app, route);
      if (res.status !== 401) notRejected.push(`${route.key} → ${res.status}`);
    }
    expect(notRejected).toEqual([]);
  }, 120000);

  it('toda ruta con sesión exige un permiso explícito, salvo las de uso general', () => {
    const withoutPermission = routes
      .filter((r) => r.hasSession && r.permissions.length === 0 && !SESSION_ONLY_ROUTES.has(r.key))
      .map((r) => r.key);
    expect(withoutPermission).toEqual([]);
  });

  it.each(Object.values(SYSTEM_ROLES))(
    'rol %s: 403 exactamente cuando le falta algún permiso exigido',
    async (roleName) => {
      const granted = rolePermissions.get(roleName)!;
      const cookie = roleCookies.get(roleName)!;
      const mismatches: string[] = [];

      for (const route of routes.filter((r) => r.permissions.length > 0)) {
        const allowed = route.permissions.every((p) => granted.has(p));
        // Una ruta permitida solo se ejecuta si es de lectura: evita efectos con datos falsos
        if (allowed && route.method !== 'GET') continue;
        const res = await send(app, route, cookie);
        if (allowed ? res.status === 403 || res.status === 401 : res.status !== 403) {
          mismatches.push(
            `${route.key} [${route.permissions.join(', ')}] → ${res.status} (esperado ${allowed ? 'acceso' : '403'})`,
          );
        }
      }
      expect(mismatches).toEqual([]);
    },
    180000,
  );
});
