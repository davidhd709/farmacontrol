import { Injectable } from '@nestjs/common';
import { Prisma } from '@farmacia/database';

type Tx = Prisma.TransactionClient;

/** Datos del proveedor que se mantienen en sincronía con su tercero. */
export interface SupplierFromThirdParty {
  taxId: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
}

/**
 * Contrato transaccional de proveedores para el módulo de terceros: crea, sincroniza y
 * activa proveedores sólo a través de estos métodos, dentro de la transacción del llamador.
 */
@Injectable()
export class SuppliersLedger {
  /** Vincula el proveedor existente con ese NIT o lo crea; devuelve su id. */
  async findOrCreate(tx: Tx, data: SupplierFromThirdParty): Promise<string> {
    const existing = await tx.supplier.findUnique({ where: { taxId: data.taxId } });
    if (existing) return existing.id;
    const created = await tx.supplier.create({ data });
    return created.id;
  }

  /** Crea o actualiza el proveedor con ese NIT; devuelve su id. */
  async upsert(tx: Tx, data: SupplierFromThirdParty): Promise<string> {
    const supplier = await tx.supplier.upsert({
      where: { taxId: data.taxId },
      create: data,
      update: {
        name: data.name,
        contactName: data.contactName,
        phone: data.phone,
        email: data.email,
        address: data.address,
        isActive: data.isActive,
      },
    });
    return supplier.id;
  }

  /** Actualiza los datos sincronizados de un proveedor ya vinculado. */
  async update(tx: Tx, id: string, changes: Omit<SupplierFromThirdParty, 'taxId'>): Promise<void> {
    await tx.supplier.update({ where: { id }, data: changes });
  }

  async setActive(tx: Tx, id: string, isActive: boolean): Promise<void> {
    await tx.supplier.update({ where: { id }, data: { isActive } });
  }
}
