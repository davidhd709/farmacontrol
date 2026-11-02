import { randomUUID } from 'crypto';
import request from 'supertest';
import { prisma } from '@farmacia/database';

type Server = Parameters<typeof request>[0];
type Target = 'RECEIVABLE' | 'PAYABLE' | 'EXPENSE';

interface Result {
  status: number;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** Recibo de caja o comprobante de egreso emitido */
  document?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * Registra el pago de una factura como lo hace hoy la aplicación (correcciones del cliente,
 * 2026-11-02): un recibo de caja para la cartera y un comprobante de egreso para cuentas por
 * pagar y causaciones. Imita la cadena de supertest (set/send/expect) de las rutas retiradas
 * `POST /{receivables|payables|expenses}/:id/payments` y responde, si sale bien, el detalle
 * actualizado de la factura para conservar las aserciones de saldo y estado.
 */
class VoucherPayment implements PromiseLike<Result> {
  private readonly headers: Record<string, string> = {};
  private payload: Record<string, unknown> = {};
  private expected?: number;

  constructor(
    private readonly server: Server,
    private readonly target: Target,
    private readonly id: string,
  ) {}

  set(name: string, value: string) {
    this.headers[name.toLowerCase()] = value;
    return this;
  }

  send(body: Record<string, unknown>) {
    this.payload = body;
    return this;
  }

  expect(status: number) {
    this.expected = status;
    return this;
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.run().then(onfulfilled, onrejected);
  }

  private async voucherBody() {
    const amount = String(this.payload.amount);
    const base = {
      paymentMethod: (this.payload.paymentMethod as string | undefined) ?? 'EFECTIVO',
      bankAccountId: this.payload.bankAccountId,
      concept: (this.payload.notes as string | undefined) || 'Pago de factura (prueba)',
    };
    if (this.target === 'RECEIVABLE') {
      const row = await prisma.receivable.findUnique({ where: { id: this.id }, select: { customerId: true } });
      return {
        path: 'treasury/cash-receipts/collections',
        body: {
          ...base,
          kind: 'CARTERA',
          customerId: row?.customerId ?? randomUUID(),
          applications: [{ receivableId: this.id, amount }],
        },
      };
    }
    const supplierId =
      this.target === 'PAYABLE'
        ? (await prisma.payable.findUnique({ where: { id: this.id }, select: { supplierId: true } }))?.supplierId
        : (await prisma.expense.findUnique({ where: { id: this.id }, select: { supplierId: true } }))?.supplierId;
    return {
      path: 'treasury/disbursements',
      body: {
        ...base,
        kind: 'PROVEEDOR',
        supplierId: supplierId ?? randomUUID(),
        applications: [
          {
            documentType: this.target === 'PAYABLE' ? 'FACTURA_COMPRA' : 'CAUSACION_GASTO',
            documentId: this.id,
            amount,
          },
        ],
      },
    };
  }

  private async run(): Promise<Result> {
    const { path, body } = await this.voucherBody();
    let call = request(this.server).post(`/api/v1/${path}`);
    for (const [name, value] of Object.entries(this.headers)) call = call.set(name, value);
    const res = await call.send(body);
    let result: Result = { status: res.status, body: res.body };
    if (res.status === 201) {
      const detailPath =
        this.target === 'RECEIVABLE' ? 'receivables' : this.target === 'PAYABLE' ? 'payables' : 'expenses';
      let detail = request(this.server).get(`/api/v1/${detailPath}/${this.id}`);
      if (this.headers.cookie) detail = detail.set('Cookie', this.headers.cookie);
      const updated = await detail;
      result = { status: 201, body: updated.body, document: res.body };
    }
    if (this.expected !== undefined && result.status !== this.expected) {
      throw new Error(
        `expected ${this.expected}, got ${result.status}: ${JSON.stringify(res.body)}`,
      );
    }
    return result;
  }
}

export const voucherPayment = (server: Server, target: Target, id: string) =>
  new VoucherPayment(server, target, id);
