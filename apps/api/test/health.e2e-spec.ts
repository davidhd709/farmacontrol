import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../src/app.module';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';

describe('GET /api/v1/health (Integración HTTP)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('debe responder HTTP 200 con el estado "ok" y metadatos válidos de salud', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toBeDefined();
    expect(response.body.status).toBe('ok');
    expect(typeof response.body.timestamp).toBe('string');
    expect(typeof response.body.uptime).toBe('number');
    expect(response.body.uptime).toBeGreaterThanOrEqual(0);
    expect(response.body.database).toBe('up');
  });

  it('responde 503 cuando la base de datos no responde, sin exponer el error interno', async () => {
    const unreachable = {
      $queryRaw: () => Promise.reject(new Error('connect ECONNREFUSED 10.0.0.5:5432 password=secreto')),
      $disconnect: () => Promise.resolve(),
    } as never;
    const moduleFixture = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: new AppService(unreachable) }],
    }).compile();
    const isolated = moduleFixture.createNestApplication();
    isolated.setGlobalPrefix('api/v1');
    await isolated.init();
    try {
      const response = await request(isolated.getHttpServer()).get('/api/v1/health');
      expect(response.status).toBe(503);
      expect(JSON.stringify(response.body)).not.toContain('ECONNREFUSED');
      expect(JSON.stringify(response.body)).not.toContain('secreto');
    } finally {
      await isolated.close();
    }
  });
});
