import { ThirdParty } from './third-party.entity';
import { ThirdPartyQueryFilters, PaginatedResponse } from '@farmacia/contracts';

export interface IThirdPartyRepository {
  findById(id: string): Promise<ThirdParty | null>;
  findByDocumentNumber(documentNumber: string): Promise<ThirdParty | null>;
  save(thirdParty: ThirdParty): Promise<void>;
  update(thirdParty: ThirdParty): Promise<void>;
  findPaginated(filters: ThirdPartyQueryFilters): Promise<PaginatedResponse<ThirdParty>>;
}
