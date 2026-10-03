import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { prisma } from '@farmacia/database';
import {
  ExpenseCategoryDto,
  CreateExpenseCategoryPayload,
  UpdateExpenseCategoryPayload,
} from '@farmacia/contracts';
import { validateUuid } from '../domain/expense-rules';

@Injectable()
export class ExpenseCategoriesService {
  private toDto(row: any): ExpenseCategoryDto {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      accountId: row.accountId,
      accountCode: row.account?.code ?? '',
      accountName: row.account?.name ?? '',
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async findAll(includeInactive = false): Promise<ExpenseCategoryDto[]> {
    const categories = await prisma.expenseCategory.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: {
        account: {
          select: { id: true, code: true, name: true, type: true, isActive: true },
        },
      },
      orderBy: { name: 'asc' },
    });
    return categories.map((c) => this.toDto(c));
  }

  async findById(id: string): Promise<ExpenseCategoryDto> {
    validateUuid(id, 'ID de categoría de gasto');
    const category = await prisma.expenseCategory.findUnique({
      where: { id },
      include: {
        account: {
          select: { id: true, code: true, name: true, type: true, isActive: true },
        },
      },
    });
    if (!category) {
      throw new NotFoundException(`Categoría de gasto con ID "${id}" no encontrada.`);
    }
    return this.toDto(category);
  }

  async create(payload: CreateExpenseCategoryPayload): Promise<ExpenseCategoryDto> {
    const name = payload.name?.trim();
    if (!name) {
      throw new BadRequestException('El nombre de la categoría es obligatorio.');
    }
    validateUuid(payload.accountId, 'ID de cuenta contable');

    // Validar cuenta contable en PUC
    const account = await prisma.account.findUnique({
      where: { id: payload.accountId },
    });
    if (!account) {
      throw new NotFoundException('La cuenta contable especificada no existe en el PUC.');
    }
    if (!account.isActive) {
      throw new BadRequestException('La cuenta contable seleccionada está inactiva.');
    }
    if (account.type !== 'EXPENSE' && account.type !== 'COST') {
      throw new BadRequestException(
        `La cuenta contable "${account.code} - ${account.name}" debe ser de tipo GASTO (EXPENSE) o COSTO (COST). Tipo actual: ${account.type}.`,
      );
    }

    const existingName = await prisma.expenseCategory.findUnique({
      where: { name },
    });
    if (existingName) {
      throw new ConflictException(`Ya existe una categoría de gasto con el nombre "${name}".`);
    }

    const created = await prisma.expenseCategory.create({
      data: {
        name,
        description: payload.description?.trim() || null,
        accountId: payload.accountId,
        isActive: true,
      },
      include: {
        account: {
          select: { id: true, code: true, name: true, type: true, isActive: true },
        },
      },
    });

    return this.toDto(created);
  }

  async update(id: string, payload: UpdateExpenseCategoryPayload): Promise<ExpenseCategoryDto> {
    validateUuid(id, 'ID de categoría de gasto');
    const category = await prisma.expenseCategory.findUnique({
      where: { id },
    });
    if (!category) {
      throw new NotFoundException(`Categoría de gasto con ID "${id}" no encontrada.`);
    }

    const data: any = {};

    if (payload.name !== undefined) {
      const name = payload.name.trim();
      if (!name) throw new BadRequestException('El nombre de la categoría no puede estar vacío.');
      if (name !== category.name) {
        const duplicate = await prisma.expenseCategory.findUnique({ where: { name } });
        if (duplicate) {
          throw new ConflictException(`Ya existe una categoría de gasto con el nombre "${name}".`);
        }
      }
      data.name = name;
    }

    if (payload.description !== undefined) {
      data.description = payload.description?.trim() || null;
    }

    if (payload.accountId !== undefined) {
      validateUuid(payload.accountId, 'ID de cuenta contable');
      const account = await prisma.account.findUnique({ where: { id: payload.accountId } });
      if (!account) {
        throw new NotFoundException('La cuenta contable especificada no existe en el PUC.');
      }
      if (!account.isActive) {
        throw new BadRequestException('La cuenta contable seleccionada está inactiva.');
      }
      if (account.type !== 'EXPENSE' && account.type !== 'COST') {
        throw new BadRequestException(
          `La cuenta contable debe ser de tipo GASTO (EXPENSE) o COSTO (COST). Tipo actual: ${account.type}.`,
        );
      }
      data.accountId = payload.accountId;
    }

    if (payload.isActive !== undefined) {
      data.isActive = Boolean(payload.isActive);
    }

    const updated = await prisma.expenseCategory.update({
      where: { id },
      data,
      include: {
        account: {
          select: { id: true, code: true, name: true, type: true, isActive: true },
        },
      },
    });

    return this.toDto(updated);
  }
}
