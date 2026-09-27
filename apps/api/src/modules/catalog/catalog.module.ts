import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AuditModule } from '../audit/audit.module';
import { CATEGORY_REPOSITORY_PORT } from './application/ports/category.repository.port';
import { PrismaCategoryRepository } from './infrastructure/adapters/prisma-category.repository';
import { CategoryService } from './application/services/category.service';
import { CategoryController } from './presentation/controllers/category.controller';
import { PRODUCT_REPOSITORY_PORT } from './application/ports/product.repository.port';
import { PrismaProductRepository } from './infrastructure/adapters/prisma-product.repository';
import { ProductService } from './application/services/product.service';
import { ProductController } from './presentation/controllers/product.controller';

import { PRODUCT_PRESENTATION_REPOSITORY_PORT } from './application/ports/product-presentation.repository.port';
import { PrismaProductPresentationRepository } from './infrastructure/adapters/prisma-product-presentation.repository';
import { ProductPresentationService } from './application/services/product-presentation.service';
import { ProductPresentationController } from './presentation/controllers/product-presentation.controller';

@Module({
  imports: [IdentityModule, AuditModule],
  controllers: [
    CategoryController,
    ProductController,
    ProductPresentationController,
  ],
  providers: [
    {
      provide: CATEGORY_REPOSITORY_PORT,
      useClass: PrismaCategoryRepository,
    },
    {
      provide: PRODUCT_REPOSITORY_PORT,
      useClass: PrismaProductRepository,
    },
    {
      provide: PRODUCT_PRESENTATION_REPOSITORY_PORT,
      useClass: PrismaProductPresentationRepository,
    },
    CategoryService,
    ProductService,
    ProductPresentationService,
  ],
  exports: [
    CATEGORY_REPOSITORY_PORT,
    CategoryService,
    PRODUCT_REPOSITORY_PORT,
    ProductService,
    PRODUCT_PRESENTATION_REPOSITORY_PORT,
    ProductPresentationService,
  ],
})
export class CatalogModule {}
