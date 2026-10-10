import {
  RequestShapeValidationPipe,
  QueryShapeValidationPipe,
} from '../../../common/pagination/request-shape.pipe';
import { PaginationQueryPipe } from '../../../common/pagination/pagination';
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ExpensesService } from '../application/expenses.service';
import {
  ExpenseDto,
  CreateExpensePayload,
  CreateExpensePaymentPayload,
  CancelExpensePayload,
  ReverseExpensePaymentPayload,
  ExpenseQueryFilters,
  ExpensesSummaryDto,
  PaginatedResponse,
  SYSTEM_PERMISSIONS,
} from '@farmacia/contracts';
import {
  SessionAuthGuard,
  AuthenticatedUserContext,
} from '../../identity/presentation/guards/session-auth.guard';
import { PermissionsGuard } from '../../identity/presentation/guards/permissions.guard';
import { RequirePermissions } from '../../identity/presentation/decorators/require-permissions.decorator';
import { CurrentUser } from '../../identity/presentation/decorators/current-user.decorator';

@Controller('expenses')
@UseGuards(SessionAuthGuard, PermissionsGuard)
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  @Get()
  @RequirePermissions(SYSTEM_PERMISSIONS.EXPENSES_READ)
  async findAll(
    @Query(
      new QueryShapeValidationPipe({
        startDate: 'date?',
        endDate: 'date?',
        categoryId: 'uuid?',
        status: 'text?',
        paymentMethod: 'text?',
        search: 'text?',
      }),
      PaginationQueryPipe,
    )
    query: ExpenseQueryFilters,
  ): Promise<PaginatedResponse<ExpenseDto>> {
    return this.service.findAll(query);
  }

  @Get('summary')
  @RequirePermissions(SYSTEM_PERMISSIONS.EXPENSES_READ)
  async getSummary(
    @Query(
      new QueryShapeValidationPipe({
        startDate: 'date?',
        endDate: 'date?',
        categoryId: 'uuid?',
        status: 'text?',
        paymentMethod: 'text?',
        search: 'text?',
      }),
      PaginationQueryPipe,
    )
    query: ExpenseQueryFilters,
  ): Promise<ExpensesSummaryDto> {
    return this.service.getSummary(query);
  }

  @Get(':id')
  @RequirePermissions(SYSTEM_PERMISSIONS.EXPENSES_READ)
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<ExpenseDto> {
    return this.service.findById(id);
  }

  @Post()
  @RequirePermissions(SYSTEM_PERMISSIONS.EXPENSES_MANAGE)
  async create(
    @Body(
      new RequestShapeValidationPipe({
        categoryId: 'uuid',
        description: 'text',
        beneficiary: 'text',
        documentNumber: 'text?',
        amount: 'decimal',
        expenseDate: 'date',
        dueDate: 'date?',
        paymentMethod: { values: ['EFECTIVO', 'TRANSFERENCIA', 'CREDITO'] },
        bankAccountId: 'uuid?',
        notes: 'text?',
        supportDocUrl: 'text?',
      }),
    )
    payload: CreateExpensePayload,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<ExpenseDto> {
    return this.service.createExpense(payload, user.id);
  }

  @Post(':id/payments')
  @RequirePermissions(SYSTEM_PERMISSIONS.EXPENSES_MANAGE)
  async pay(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(
      new RequestShapeValidationPipe({
        amount: 'decimal',
        paymentDate: 'date',
        paymentMethod: { values: ['EFECTIVO', 'TRANSFERENCIA'] },
        bankAccountId: 'uuid?',
        notes: 'text?',
      }),
    )
    payload: CreateExpensePaymentPayload,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<ExpenseDto> {
    return this.service.payExpense(id, payload, user.id);
  }

  @Post(':id/cancel')
  @RequirePermissions(SYSTEM_PERMISSIONS.EXPENSES_MANAGE)
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new RequestShapeValidationPipe({ cancellationReason: 'text' }))
    payload: CancelExpensePayload,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<ExpenseDto> {
    return this.service.cancelExpense(id, payload, user.id);
  }

  @Post('payments/:paymentId/reverse')
  @RequirePermissions(SYSTEM_PERMISSIONS.EXPENSES_MANAGE)
  async reversePayment(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body(new RequestShapeValidationPipe({ reversalReason: 'text' }))
    payload: ReverseExpensePaymentPayload,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<ExpenseDto> {
    return this.service.reversePayment(paymentId, payload, user.id);
  }
}
