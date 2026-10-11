import { ThirdParty } from './third-party.entity';
import { ThirdPartyQueryFilters, PaginatedResponse } from '@farmacia/contracts';

export interface IThirdPartyRepository {
  findById(id: string): Promise<ThirdParty | null>;
  findByDocumentNumber(documentNumber: string): Promise<ThirdParty | null>;
  /** `tx` es la transacción del caso de uso, opaca para el dominio. */
  save(thirdParty: ThirdParty, tx?: unknown): Promise<void>;
  update(thirdParty: ThirdParty, tx?: unknown): Promise<void>;
  findPaginated(filters: ThirdPartyQueryFilters): Promise<PaginatedResponse<ThirdParty>>;
}
