import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  DIVIPOLA_CATALOG_METADATA,
  DIVIPOLA_DEPARTMENTS,
  DIVIPOLA_MUNICIPALITIES,
  filterDivipolaDepartments,
  filterDivipolaMunicipalities,
  findDivipolaDepartment,
  findMunicipalityInDepartment,
  getMunicipalitiesByDepartment,
  resolveThirdPartyDivipolaLocation,
} from '@farmacia/contracts';
import { ThirdParty } from './third-party.entity';
import { CreateThirdPartyValidationPipe } from '../presentation/dtos/create-third-party.dto';
import { UpdateThirdPartyValidationPipe } from '../presentation/dtos/update-third-party.dto';
import { ThirdPartyController } from '../presentation/controllers/third-party.controller';
import { DomainError } from '../../../common/domain-error';

const baseCreateProps = {
  personType: 'NATURAL' as const,
  documentType: 'CC' as const,
  documentNumber: '1067890123',
  verificationDigit: null,
  name: 'Juan Pérez',
  tradeName: null,
  contactName: null,
  phone: '3001234567',
  email: 'juan@example.com',
  address: 'Calle 10 # 5-20',
  taxRegime: 'NO_RESPONSABLE_IVA' as const,
  isCustomer: true,
  isSupplier: false,
  isEmployee: false,
  isOther: false,
};

describe('Catálogo oficial DANE DIVIPOLA y validación de ubicación en Terceros', () => {
  it('1. contiene los 32 departamentos de Colombia + Bogotá, D. C. (33 entidades) y 1.122 municipios sin duplicados ni departamentos inválidos', () => {
    expect(DIVIPOLA_CATALOG_METADATA.datasetId).toBe('gdxc-w37w');
    expect(DIVIPOLA_CATALOG_METADATA.dataCutoffDate).toBe('2024-12-30');
    expect(DIVIPOLA_CATALOG_METADATA.dataUpdatedAt).toBe('2025-01-24');
    expect(DIVIPOLA_CATALOG_METADATA.metadataUpdatedAt).toBe('2026-09-24');
    expect(DIVIPOLA_DEPARTMENTS).toHaveLength(33);
    expect(DIVIPOLA_MUNICIPALITIES).toHaveLength(1122);

    // Verificar unicidad de códigos y nombres de departamento
    const deptCodes = new Set(DIVIPOLA_DEPARTMENTS.map((d) => d.code));
    const deptNames = new Set(DIVIPOLA_DEPARTMENTS.map((d) => d.name));
    expect(deptCodes.size).toBe(33);
    expect(deptNames.size).toBe(33);
    for (const dept of DIVIPOLA_DEPARTMENTS) {
      expect(dept.code).toMatch(/^\d{2}$/);
    }

    // Verificar unicidad de los 1.122 códigos de municipio y consistencia con su departamento
    const mpioCodes = new Set<string>();
    const deptMpioNamePairs = new Set<string>();
    for (const mpio of DIVIPOLA_MUNICIPALITIES) {
      expect(mpio.code).toMatch(/^\d{5}$/);
      expect(mpio.code.slice(0, 2)).toBe(mpio.departmentCode);
      expect(deptCodes.has(mpio.departmentCode)).toBe(true);
      mpioCodes.add(mpio.code);
      deptMpioNamePairs.add(`${mpio.departmentCode}:${mpio.name}`);
    }
    expect(mpioCodes.size).toBe(1122);
    expect(deptMpioNamePairs.size).toBe(1122);

    const names = DIVIPOLA_DEPARTMENTS.map((d) => d.name);
    expect(names).toContain('Sucre');
    expect(names).toContain('Córdoba');
    expect(names).toContain('Antioquia');
    expect(names).toContain('Atlántico');
    expect(names).toContain('Bogotá, D. C.');
    expect(names).toContain('Bolívar');
    expect(names).toContain('Boyacá');
    expect(names).toContain('Chocó');
    expect(names).toContain('Nariño');
    expect(names).toContain('Quindío');
    expect(names).toContain('Archipiélago de San Andrés, Providencia y Santa Catalina');
  });

  it('2. al seleccionar Sucre permite encontrar Sincelejo y sus municipios oficiales', () => {
    const sucre = findDivipolaDepartment('Sucre');
    expect(sucre).toEqual({ code: '70', name: 'Sucre' });

    const sucreMunicipalities = getMunicipalitiesByDepartment('70');
    expect(sucreMunicipalities.length).toBeGreaterThanOrEqual(26);
    const sincelejo = findMunicipalityInDepartment('70', 'Sincelejo');
    expect(sincelejo).toBeDefined();
    expect(sincelejo?.code).toBe('70001');
    expect(sincelejo?.name).toBe('Sincelejo');
    expect(sincelejo?.departmentCode).toBe('70');
  });

  it('3. al seleccionar Córdoba muestra Montería, Cereté, Sahagún, Planeta Rica y demás municipios de Córdoba', () => {
    const cordoba = findDivipolaDepartment('Córdoba');
    expect(cordoba).toEqual({ code: '23', name: 'Córdoba' });

    const cordobaMunicipalities = getMunicipalitiesByDepartment('23');
    expect(cordobaMunicipalities).toHaveLength(30);
    const municipalityNames = cordobaMunicipalities.map((m) => m.name);
    expect(municipalityNames).toContain('Montería');
    expect(municipalityNames).toContain('Cereté');
    expect(municipalityNames).toContain('Sahagún');
    expect(municipalityNames).toContain('Planeta Rica');
    expect(municipalityNames).toContain('Lorica');
    expect(municipalityNames).toContain('Montelíbano');
    expect(municipalityNames).not.toContain('Sincelejo');

    // Búsqueda insensible a tildes y mayúsculas
    expect(filterDivipolaDepartments(DIVIPOLA_DEPARTMENTS, 'cordoba').map((d) => d.name)).toContain(
      'Córdoba',
    );
    expect(
      filterDivipolaMunicipalities(cordobaMunicipalities, 'monteria').map((m) => m.name),
    ).toContain('Montería');
    expect(
      filterDivipolaMunicipalities(cordobaMunicipalities, 'cerete').map((m) => m.name),
    ).toContain('Cereté');
    expect(
      filterDivipolaMunicipalities(cordobaMunicipalities, 'sahagun').map((m) => m.name),
    ).toContain('Sahagún');
  });

  it('4. rechaza guardar un municipio de Sucre (Sincelejo) asociado a Córdoba', () => {
    expect(() =>
      ThirdParty.create({
        ...baseCreateProps,
        department: 'Córdoba',
        city: 'Sincelejo',
      }),
    ).toThrowError(/no pertenece al departamento "Córdoba"/i);

    expect(() =>
      ThirdParty.create({
        ...baseCreateProps,
        department: 'Córdoba',
        city: 'Montería',
        departmentCode: '23',
        municipalityCode: '70001', // Sincelejo (Sucre)
      }),
    ).toThrowError(DomainError);
  });

  it('5. rechaza departamentos o municipios inexistentes en el catálogo oficial', () => {
    expect(() =>
      ThirdParty.create({
        ...baseCreateProps,
        department: 'Departamento Fantasma',
        city: 'Montería',
      }),
    ).toThrowError(/no existe en el catálogo oficial DIVIPOLA/i);

    expect(() =>
      ThirdParty.create({
        ...baseCreateProps,
        department: 'Córdoba',
        city: 'Ciudad Inventada',
      }),
    ).toThrowError(/no existe en el catálogo oficial DIVIPOLA/i);
  });

  it('6. crear un tercero guarda correctamente departamento, municipio y códigos DIVIPOLA', () => {
    const tp = ThirdParty.create({
      ...baseCreateProps,
      department: 'Sucre',
      city: 'Sincelejo',
    });
    const dto = tp.toDto();
    expect(dto.department).toBe('Sucre');
    expect(dto.city).toBe('Sincelejo');
    expect(dto.departmentCode).toBe('70');
    expect(dto.municipalityCode).toBe('70001');
  });

  it('7. editar un tercero recupera y actualiza los valores registrados', () => {
    const tp = ThirdParty.reconstitute({
      ...baseCreateProps,
      id: 'tp-existing-1',
      department: 'Córdoba',
      city: 'Montería',
      isActive: true,
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
      updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    });

    expect(tp.department).toBe('Córdoba');
    expect(tp.city).toBe('Montería');
    expect(tp.departmentCode).toBe('23');
    expect(tp.municipalityCode).toBe('23001');

    tp.update({
      department: 'Córdoba',
      city: 'Cereté',
    });

    expect(tp.department).toBe('Córdoba');
    expect(tp.city).toBe('Cereté');
    expect(tp.departmentCode).toBe('23');
    expect(tp.municipalityCode).toBe('23162');
  });

  it('8. los terceros existentes conservan su información sin asignaciones dudosas en municipios ambiguos o legados', () => {
    // Caso A: Municipio único en el país sin departamento registrado (ej. Montería) -> se identifica con certeza
    const uniqueCityResolution = resolveThirdPartyDivipolaLocation({
      department: null,
      city: 'Monteria',
    });
    expect(uniqueCityResolution.status).toBe('RESOLVED_UNIQUE_CITY');
    expect(uniqueCityResolution.department?.name).toBe('Córdoba');
    expect(uniqueCityResolution.municipality?.name).toBe('Montería');

    // Caso B: Municipio homónimo en varios departamentos sin departamento registrado (ej. Buenavista: Boyacá, Córdoba, Quindío, Sucre)
    const ambiguousResolution = resolveThirdPartyDivipolaLocation({
      department: null,
      city: 'Buenavista',
    });
    expect(ambiguousResolution.status).toBe('AMBIGUOUS_CITY');
    expect(ambiguousResolution.department).toBeNull();
    expect(ambiguousResolution.municipality).toBeNull();
    expect(ambiguousResolution.legacyCity).toBe('Buenavista');

    // Reconstituir un tercero existente con ubicación ambigua conserva su valor original intacto y permite editar otros campos
    const legacyTp = ThirdParty.reconstitute({
      ...baseCreateProps,
      id: 'tp-legacy-ambiguous',
      department: null,
      city: 'Buenavista',
      isActive: true,
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
      updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    });
    expect(legacyTp.department).toBeNull();
    expect(legacyTp.city).toBe('Buenavista');
    expect(legacyTp.departmentCode).toBeNull();
    expect(legacyTp.municipalityCode).toBeNull();

    // Actualizar el teléfono sin cambiar la ubicación conserva el valor original sin arrojar error
    legacyTp.update({ phone: '3119998877', city: 'Buenavista', department: null });
    expect(legacyTp.phone).toBe('3119998877');
    expect(legacyTp.city).toBe('Buenavista');
    expect(legacyTp.department).toBeNull();

    // Actualizar campos no relacionados omitiendo city/department tampoco bloquea la edición
    legacyTp.update({ email: 'nuevo@example.com' });
    expect(legacyTp.email).toBe('nuevo@example.com');
    expect(legacyTp.city).toBe('Buenavista');
    expect(legacyTp.department).toBeNull();
  });

  it('9. los códigos DIVIPOLA conservan los ceros a la izquierda como texto', () => {
    const antioquia = findDivipolaDepartment('05');
    expect(antioquia?.code).toBe('05');
    expect(antioquia?.name).toBe('Antioquia');

    const medellin = findMunicipalityInDepartment('05', 'Medellín');
    expect(medellin?.code).toBe('05001');
    expect(typeof medellin?.code).toBe('string');

    const atlantico = findDivipolaDepartment('08');
    expect(atlantico?.code).toBe('08');
    expect(atlantico?.name).toBe('Atlántico');

    const barranquilla = findMunicipalityInDepartment('08', 'Barranquilla');
    expect(barranquilla?.code).toBe('08001');
  });

  it('10. DTOs y controlador de terceros procesan códigos DIVIPOLA y convierten errores de validación en 400 Bad Request', async () => {
    const createDto = new CreateThirdPartyValidationPipe().transform({
      personType: 'NATURAL',
      documentType: 'CC',
      documentNumber: '1067890123',
      name: 'María Fernanda Vergara',
      department: 'Antioquia',
      city: 'Medellín',
      departmentCode: '05',
      municipalityCode: '05001',
      isCustomer: true,
    });
    expect(createDto.department).toBe('Antioquia');
    expect(createDto.city).toBe('Medellín');
    expect(createDto.departmentCode).toBe('05');
    expect(createDto.municipalityCode).toBe('05001');

    const updateDto = new UpdateThirdPartyValidationPipe().transform({
      department: 'Sucre',
      city: 'Sincelejo',
      departmentCode: '70',
      municipalityCode: '70001',
    });
    expect(updateDto.departmentCode).toBe('70');
    expect(updateDto.municipalityCode).toBe('70001');

    const mockService = {
      createThirdParty: vi
        .fn()
        .mockRejectedValue(
          new DomainError(
            'El municipio "Sincelejo" no pertenece al departamento "Córdoba".',
            'validation',
          ),
        ),
    };
    const controller = new ThirdPartyController(mockService as never);
    await expect(
      controller.create(
        {
          personType: 'NATURAL',
          documentType: 'CC',
          documentNumber: '1067890123',
          name: 'Prueba',
          department: 'Córdoba',
          city: 'Sincelejo',
          isCustomer: true,
        },
        { id: 'user-1', role: 'ADMIN', permissions: ['third_parties:manage'] } as never,
        { ip: '127.0.0.1', headers: {} } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
