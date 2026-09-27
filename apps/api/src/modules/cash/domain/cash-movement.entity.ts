import { CashMovementType, PaymentMethod } from '@farmacia/contracts';
import {
  InvalidCashAmountException,
  InvalidCashMovementTypeException,
} from './cash.exceptions';

export interface CashMovementProps {
  id?: string;
  movementType: CashMovementType;
  amount: number;
  paymentMethod?: PaymentMethod;
  reason: string;
  referenceDocumentType?: string | null;
  referenceDocumentId?: string | null;
  balanceAfter: number;
  createdAt?: Date;
  createdByUserId: string;
  createdByUsername?: string;
}

export class CashMovement {
  private readonly _id: string;
  private readonly _movementType: CashMovementType;
  private readonly _amount: number;
  private readonly _paymentMethod: PaymentMethod;
  private readonly _reason: string;
  private readonly _referenceDocumentType?: string | null;
  private readonly _referenceDocumentId?: string | null;
  private readonly _balanceAfter: number;
  private readonly _createdAt: Date;
  private readonly _createdByUserId: string;
  private readonly _createdByUsername?: string;

  constructor(props: CashMovementProps) {
    CashMovement.validate(props);

    this._id = props.id || '';
    this._movementType = props.movementType;
    this._amount = props.amount;
    this._paymentMethod = props.paymentMethod || 'EFECTIVO';
    this._reason = props.reason.trim();
    this._referenceDocumentType = props.referenceDocumentType || null;
    this._referenceDocumentId = props.referenceDocumentId || null;
    this._balanceAfter = props.balanceAfter;
    this._createdAt = props.createdAt || new Date();
    this._createdByUserId = props.createdByUserId;
    this._createdByUsername = props.createdByUsername;
  }

  private static validate(props: CashMovementProps): void {
    if (!props.amount || props.amount <= 0 || isNaN(props.amount)) {
      throw new InvalidCashAmountException(props.amount);
    }

    const validTypes: CashMovementType[] = [
      'INGRESO_VENTA',
      'INGRESO_MANUAL',
      'EGRESO_MANUAL',
      'EGRESO_PAGO_PROVEEDOR',
    ];

    if (!validTypes.includes(props.movementType)) {
      throw new InvalidCashMovementTypeException(props.movementType);
    }

    if (!props.reason || props.reason.trim().length === 0) {
      throw new Error('El motivo del movimiento de caja es obligatorio');
    }

    if (props.balanceAfter < 0) {
      throw new Error('El saldo acumulado de caja no puede ser negativo');
    }
  }

  get id(): string {
    return this._id;
  }

  get movementType(): CashMovementType {
    return this._movementType;
  }

  get amount(): number {
    return this._amount;
  }

  get paymentMethod(): PaymentMethod {
    return this._paymentMethod;
  }

  get reason(): string {
    return this._reason;
  }

  get referenceDocumentType(): string | null | undefined {
    return this._referenceDocumentType;
  }

  get referenceDocumentId(): string | null | undefined {
    return this._referenceDocumentId;
  }

  get balanceAfter(): number {
    return this._balanceAfter;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get createdByUserId(): string {
    return this._createdByUserId;
  }

  get createdByUsername(): string | undefined {
    return this._createdByUsername;
  }

  public isIncome(): boolean {
    return (
      this._movementType === 'INGRESO_VENTA' ||
      this._movementType === 'INGRESO_MANUAL'
    );
  }

  public isExpense(): boolean {
    return (
      this._movementType === 'EGRESO_MANUAL' ||
      this._movementType === 'EGRESO_PAGO_PROVEEDOR'
    );
  }

  public affectsPhysicalCash(): boolean {
    return this._paymentMethod === 'EFECTIVO';
  }
}
