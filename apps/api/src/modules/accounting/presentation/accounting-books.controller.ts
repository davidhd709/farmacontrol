import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import {
  SYSTEM_PERMISSIONS,
  type JournalBookDto,
  type LedgerBookDto,
  type ReconciliationDto,
} from '@farmacia/contracts';
import { AccountingBooksService } from '../application/accounting-books.service';
import { SessionAuthGuard } from '../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../identity/presentation/decorators/require-permissions.decorator';

/** Libros oficiales y conciliación contable (ADR-006, F8). */
@Controller('accounting')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class AccountingBooksController {
  constructor(private readonly books: AccountingBooksService) {}

  @Get('books/journal')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  @ApiOperation({ summary: 'Libro diario: asientos publicados del período' })
  journal(@Query('from') from: string, @Query('to') to: string): Promise<JournalBookDto> {
    return this.books.journalBook(from, to);
  }

  @Get('books/ledger')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  @ApiOperation({ summary: 'Libro mayor y balances: saldo inicial, movimientos y saldo final' })
  ledger(@Query('from') from: string, @Query('to') to: string): Promise<LedgerBookDto> {
    return this.books.ledgerBook(from, to);
  }

  @Get('reconciliation')
  @RequirePermissions(SYSTEM_PERMISSIONS.ACCOUNTING_READ)
  @ApiOperation({
    summary: 'Contabilidad frente a caja, bancos, cartera, proveedores e inventario',
  })
  reconciliation(): Promise<ReconciliationDto> {
    return this.books.reconciliation();
  }
}
