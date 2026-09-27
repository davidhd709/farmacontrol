import { Purchase } from './purchase.entity';
import { PurchaseQueryFilters } from '@farmacia/contracts';

export const PURCHASE_REPOSITORY = Symbol('PURCHASE_REPOSITORY');

export interface IPurchaseRepository {
  saveTransactional(
    purchase: Purchase,
    defaultLocationId: string,
    actorUserId: string | null
  ): Promise<Purchase>;
  findById(id: string): Promise<Purchase | null>;
  findAll(filters: PurchaseQueryFilters): Promise<{ items: Purchase[]; total: number }>;
}
