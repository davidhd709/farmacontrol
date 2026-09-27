import { UnitOfMeasure } from '../../domain/entities/unit-of-measure.entity';
import type { UnitOfMeasureQueryFilters } from '@farmacia/contracts';

export const UNIT_OF_MEASURE_REPOSITORY = Symbol('UNIT_OF_MEASURE_REPOSITORY');

export interface UnitOfMeasureRepositoryPort {
  findById(id: string): Promise<UnitOfMeasure | null>;
  findByCode(code: string): Promise<UnitOfMeasure | null>;
  findByName(name: string): Promise<UnitOfMeasure | null>;
  save(unit: UnitOfMeasure): Promise<UnitOfMeasure>;
  update(unit: UnitOfMeasure): Promise<UnitOfMeasure>;
  findAll(filters?: UnitOfMeasureQueryFilters): Promise<{ items: UnitOfMeasure[]; total: number }>;
}
