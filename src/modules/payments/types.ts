export interface MayarCustomer {
  name?: string;
  email?: string;
  mobile?: string;
}

export interface MayarInvoice {
  id: string;
  transactionId: string | null;
  amount: bigint;
  status: string;
  link: string;
  customer?: MayarCustomer;
  paymentUrl?: string;
  extraData?: Record<string, unknown> | null;
  expiredAt?: string | null;
  userId?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface MayarTransaction {
  id: string;
  amount: bigint;
  status: string;
  paymentLink?: { id?: string; status?: string } | null;
  customer?: MayarCustomer;
  userId?: string;
}

export interface CreateInvoiceInput {
  name: string;
  email: string;
  mobile: string;
  amount: bigint;
  description: string;
  orderId: string;
  redirectUrl?: string;
}

export interface OrderSnapshot {
  orderId: string;
  payable: bigint;
  currency: string;
  buyerEmail: string;
}

export interface VerifiedPaymentData {
  provider: "mayar";
  environment: string;
  merchantId: string;
  invoiceId: string;
  transactionId: string;
  orderId?: string;
  payableIdr: bigint;
  amount: bigint;
  currency: "IDR";
  evidenceHash: string;
  verifiedAt: Date;
  adapterContractVersion: string;
}

export interface MayarClientConfig {
  apiKey?: string;
  baseUrl?: string;
  environment?: "sandbox" | "production" | string;
}

export class AmountMismatchError extends Error {
  constructor(
    public readonly expected: bigint,
    public readonly actual: bigint,
    message?: string
  ) {
    super(
      message ??
        `Payment amount mismatch: expected ${expected} IDR, received ${actual} IDR`
    );
    this.name = "AmountMismatchError";
  }
}

export class PaymentVerificationError extends Error {
  constructor(
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "PaymentVerificationError";
  }
}

export class MayarApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody?: unknown
  ) {
    super(message);
    this.name = "MayarApiError";
  }
}
