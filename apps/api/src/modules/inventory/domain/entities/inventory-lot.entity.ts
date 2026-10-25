import { businessDateOf, calendarDate } from '../../../../common/utils/business-date';
import type { InventoryControlMode, InventoryLotDto } from '@farmacia/contracts';
import { INVENTORY_CONTROL_MODES } from '@farmacia/contracts';
import {
  InvalidLotDataException,
  NegativeQuantityException,
} from '../exceptions/inventory.exceptions';

export interface CreateInventoryLotProps {
  id?: string;
  productId: string;
  locationId: string;
  lotNumber: string | null;
  expirationDate: Date | string | null;
  controlMode: InventoryControlMode;
  currentQuantity?: number;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ReconstituteInventoryLotProps {
  id: string;
  productId: string;
  locationId: string;
  lotNumber: string | null;
  expirationDate: Date | null;
  controlMode: InventoryControlMode;
  currentQuantity: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  product?: {
    id: string;
    code: string;
    name: string;
    baseUnit: string;
  };
  location?: {
    id: string;
    code: string;
    name: string;
  };
}

export class InventoryLot {
  private readonly _id: string;
  private readonly _productId: string;
  private readonly _locationId: string;
  private _lotNumber: string | null;
  private _expirationDate: Date | null;
  private readonly _controlMode: InventoryControlMode;
  private _currentQuantity: number; // En unidades base enteras
  private _isActive: boolean;
  private readonly _createdAt: Date;
  private _updatedAt: Date;
  private _product?: {
    id: string;
    code: string;
    name: string;
    baseUnit: string;
  };
  private _location?: {
    id: string;
    code: string;
    name: string;
  };

  private constructor(props: ReconstituteInventoryLotProps) {
    this._id = props.id;
    this._productId = props.productId;
    this._locationId = props.locationId;
    this._lotNumber = props.lotNumber;
    this._expirationDate = props.expirationDate;
    this._controlMode = props.controlMode;
    this._currentQuantity = props.currentQuantity;
    this._isActive = props.isActive;
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
    this._product = props.product;
    this._location = props.location;
  }

  public static create(props: CreateInventoryLotProps): InventoryLot {
    if (!props.productId || typeof props.productId !== 'string') {
      throw new InvalidLotDataException('El ID del producto es obligatorio.');
    }
    if (!props.locationId || typeof props.locationId !== 'string') {
      throw new InvalidLotDataException('El ID de la ubicación es obligatorio.');
    }

    if (!INVENTORY_CONTROL_MODES.includes(props.controlMode)) {
      throw new InvalidLotDataException('El modo de control de inventario no es válido.');
    }
    const lotNumber = props.lotNumber?.trim().toUpperCase() || null;
    if (lotNumber !== null && lotNumber.length < 2) {
      throw new InvalidLotDataException('El código de lote debe tener al menos 2 caracteres.');
    }
    if (
      (props.controlMode === 'LOT' ||
        props.controlMode === 'LOT_EXPIRY' ||
        props.controlMode === 'SERIAL') &&
      lotNumber === null
    ) {
      throw new InvalidLotDataException(
        `El código de lote o serie es obligatorio para el modo ${props.controlMode}.`,
      );
    }
    const expirationDate =
      props.expirationDate == null
        ? null
        : typeof props.expirationDate === 'string'
          ? new Date(props.expirationDate)
          : props.expirationDate;
    if (expirationDate && isNaN(expirationDate.getTime())) {
      throw new InvalidLotDataException('La fecha de vencimiento es inválida.');
    }

    const validShape =
      (props.controlMode === 'SIMPLE' && lotNumber === null && expirationDate === null) ||
      (props.controlMode === 'LOT' && lotNumber !== null && expirationDate === null) ||
      (props.controlMode === 'LOT_EXPIRY' && lotNumber !== null && expirationDate !== null) ||
      (props.controlMode === 'SERIAL' && lotNumber !== null && expirationDate === null);
    if (!validShape)
      throw new InvalidLotDataException(
        `Lote y vencimiento no corresponden al modo ${props.controlMode}.`,
      );

    const currentQuantity = props.currentQuantity ?? 0;
    if (
      !Number.isInteger(currentQuantity) ||
      currentQuantity < 0 ||
      (props.controlMode === 'SERIAL' && currentQuantity > 1)
    ) {
      throw new NegativeQuantityException(
        'La cantidad del lote debe ser un entero positivo o cero en unidades base.',
      );
    }

    const now = new Date();
    return new InventoryLot({
      id: props.id ?? crypto.randomUUID(),
      productId: props.productId,
      locationId: props.locationId,
      lotNumber,
      expirationDate,
      controlMode: props.controlMode,
      currentQuantity,
      isActive: props.isActive ?? true,
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
    });
  }

  public static reconstitute(props: ReconstituteInventoryLotProps): InventoryLot {
    return new InventoryLot(props);
  }

  // Getters
  public get id(): string {
    return this._id;
  }
  public get productId(): string {
    return this._productId;
  }
  public get locationId(): string {
    return this._locationId;
  }
  public get lotNumber(): string | null {
    return this._lotNumber;
  }
  public get expirationDate(): Date | null {
    return this._expirationDate;
  }
  public get currentQuantity(): number {
    return this._currentQuantity;
  }
  public get controlMode(): InventoryControlMode {
    return this._controlMode;
  }
  public get isActive(): boolean {
    return this._isActive;
  }
  public get createdAt(): Date {
    return this._createdAt;
  }
  public get updatedAt(): Date {
    return this._updatedAt;
  }
  public get product() {
    return this._product;
  }
  public get location() {
    return this._location;
  }

  public isExpired(referenceDate: Date = new Date()): boolean {
    return (
      this._expirationDate !== null &&
      this._expirationDate.toISOString().slice(0, 10) < businessDateOf(referenceDate)
    );
  }

  public daysUntilExpiration(referenceDate: Date = new Date()): number {
    if (!this._expirationDate) return Number.POSITIVE_INFINITY;
    const ref = calendarDate(businessDateOf(referenceDate));
    const diffTime = this._expirationDate.getTime() - ref.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  public toDto(): InventoryLotDto {
    return {
      id: this._id,
      productId: this._productId,
      locationId: this._locationId,
      lotNumber: this._lotNumber,
      expirationDate: this._expirationDate?.toISOString().split('T')[0] ?? null,
      currentQuantity: this._currentQuantity,
      isActive: this._isActive,
      createdAt: this._createdAt.toISOString(),
      updatedAt: this._updatedAt.toISOString(),
      product: this._product,
      location: this._location,
    };
  }
}
