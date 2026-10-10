import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureOpenApi } from '../../src/common/config/openapi.config';

describe('OpenAPI', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    configureOpenApi(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('serves a tagged document with cookie session auth', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/docs-json').expect(200);
    expect(Object.keys(response.body.paths).length).toBeGreaterThan(0);
    expect(response.body.paths['/api/v1/auth/login']).toBeDefined();
    expect(response.body.components.securitySchemes.sid).toMatchObject({
      type: 'apiKey',
      in: 'cookie',
      name: 'sid',
    });
    expect(response.body.paths['/api/v1/auth/login'].post.tags).toEqual(['auth']);
  });

  it('serves the Swagger UI', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/docs').expect(200);
    expect(response.headers['content-type']).toContain('text/html');
  });
});
