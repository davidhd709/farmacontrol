import { Injectable } from '@nestjs/common';
import { Prisma } from '@farmacia/database';

type Tx = Prisma.TransactionClient;

/** Datos del cliente que se mantienen en sincronía con su tercero. */
export interface CustomerFromThirdParty {
  documentType: string;
  documentNumber: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
}

/**
 * Contrato transaccional de clientes para el módulo de terceros: crea, sincroniza y
 * activa clientes sólo a través de estos métodos, dentro de la transacción del llamador.
 */
@Injectable()
export class CustomersLedger {
  /** Vincula el cliente existente con ese documento o lo crea; devuelve su id. */
  async findOrCreate(tx: Tx, data: CustomerFromThirdParty): Promise<string> {
    const existing = await tx.customer.findUnique({
      where: { documentNumber: data.documentNumber },
    });
    if (existing) return existing.id;
    const created = await tx.customer.create({ data });
    return created.id;
  }

  /** Crea o actualiza el cliente con ese documento; devuelve su id. */
  async upsert(tx: Tx, data: CustomerFromThirdParty): Promise<string> {
    const customer = await tx.customer.upsert({
      where: { documentNumber: data.documentNumber },
      create: data,
      update: {
        name: data.name,
        phone: data.phone,
        email: data.email,
        address: data.address,
        isActive: data.isActive,
      },
    });
    return customer.id;
  }

  /** Actualiza los datos sincronizados de un cliente ya vinculado. */
  async update(
    tx: Tx,
    id: string,
    changes: Omit<CustomerFromThirdParty, 'documentType' | 'documentNumber'>,
  ): Promise<void> {
    await tx.customer.update({ where: { id }, data: changes });
  }

  async setActive(tx: Tx, id: string, isActive: boolean): Promise<void> {
    await tx.customer.update({ where: { id }, data: { isActive } });
  }
}
