import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma, cleanTestDatabase } from '@farmacia/database';
import { PrismaUserRepository } from '../../src/modules/identity/infrastructure/adapters/prisma-user.repository';
import { User } from '../../src/modules/identity/domain/entities/user.entity';
import { Username } from '../../src/modules/identity/domain/value-objects/username.vo';

describe('PrismaUserRepository (Integration with PostgreSQL)', () => {
  const repository = new PrismaUserRepository(prisma);

  beforeAll(async () => {
    await cleanTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestDatabase();
  });

  afterAll(async () => {
    await cleanTestDatabase();
    await prisma.$disconnect();
  });

  it('debe persistir un nuevo User y recuperarlo por ID mapeando a entidad de dominio', async () => {
    const domainUser = User.create({
      username: Username.create('farmaceutico_integration'),
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhashforintegrationtest',
    });

    const created = await repository.create(domainUser);

    expect(created.id).toBeDefined();
    expect(typeof created.id).toBe('string');
    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(created.username.value).toBe('farmaceutico_integration');
    expect(created.isActive).toBe(true);
    expect(created.createdAt).toBeInstanceOf(Date);

    // Recuperar por ID
    const retrieved = await repository.findById(created.id!);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(created.id);
    expect(retrieved!.username.value).toBe('farmaceutico_integration');
    expect(retrieved!.passwordHash).toBe(domainUser.passwordHash);
  });

  it('debe recuperar un User por username de forma insensible a mayúsculas', async () => {
    const domainUser = User.create({
      username: Username.create('regente_turno'),
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$hashregente',
    });

    await repository.create(domainUser);

    // Buscar con diferente capitalización 'REGENTE_TURNO'
    const found = await repository.findByUsername('REGENTE_TURNO');
    expect(found).not.toBeNull();
    expect(found!.username.value).toBe('regente_turno');

    // Buscar uno inexistente
    const notFound = await repository.findByUsername('no_existe');
    expect(notFound).toBeNull();
  });

  it('debe contar correctamente la cantidad de usuarios registrados', async () => {
    expect(await repository.count()).toBe(0);

    await repository.create(
      User.create({
        username: 'user_uno',
        passwordHash: 'hash_uno',
      })
    );
    expect(await repository.count()).toBe(1);

    await repository.create(
      User.create({
        username: 'user_dos',
        passwordHash: 'hash_dos',
      })
    );
    expect(await repository.count()).toBe(2);
  });

  it('debe actualizar el estado isActive y passwordHash de un usuario', async () => {
    const created = await repository.create(
      User.create({
        username: 'user_a_modificar',
        passwordHash: 'hash_inicial',
      })
    );

    created.deactivate();
    created.updatePasswordHash('nuevo_hash_actualizado');

    const updated = await repository.update(created);

    expect(updated.isActive).toBe(false);
    expect(updated.passwordHash).toBe('nuevo_hash_actualizado');

    const inDb = await repository.findById(created.id!);
    expect(inDb!.isActive).toBe(false);
    expect(inDb!.passwordHash).toBe('nuevo_hash_actualizado');
  });
});
