export type CheckoutOrderStatus =
  | "INVOICE_CREATING"
  | "AWAITING_PAYMENT"
  | "CREATE_UNKNOWN"
  | "PAID"
  | "EXPIRED"
  | "FAILED"
  | "CANCELLED"
  | "pending"
  | "paid"
  | "expired"
  | "failed"
  | "cancelled";

export interface QuoteBook {
  id: string;
  slug: string;
  title: string;
}

export interface OfferQuote {
  offerId: string;
  tierId: string;
  tierCode: string;
  currency: "IDR";
  subtotal: bigint;
  discount: bigint;
  tax: bigint;
  payable: bigint;
  termsVersion: string;
  books: QuoteBook[];
  createdAt: Date;
  expiresAt: Date;
  token: string;
}

export interface QuoteTokenPayload {
  tierId: string;
  tierCode: string;
  amountIdr: string;
  expiresAt: string;
  termsVersion: string;
}

export interface CheckoutInput {
  offerId: string;
  email: string;
  name: string;
  mobile: string;
  quoteToken?: string;
  quote?: OfferQuote;
}

export interface CheckoutResult {
  orderId: string;
  status: CheckoutOrderStatus;
  paymentUrl?: string;
  invoiceId?: string;
  idempotentReplay?: boolean;
}

export interface OrderItemDto {
  bookId: string;
  bookTitle: string;
  price: bigint;
}

export interface OrderStatusDto {
  orderId: string;
  status: CheckoutOrderStatus;
  currency: "IDR";
  payable: bigint;
  buyerEmail: string;
  buyerName: string;
  invoiceId: string | null;
  paymentUrl?: string | null;
  paidAt: Date | null;
  createdAt: Date;
  items: OrderItemDto[];
}

export class ConflictError extends Error {
  readonly status = 409;
  readonly statusCode = 409;
  readonly code: string;

  constructor(messageOrCode = "Conflict", codeOrMessage = "CONFLICT") {
    let resolvedMessage: string;
    let resolvedCode: string;

    if (/^[A-Z0-9_]+$/.test(messageOrCode) && codeOrMessage !== "CONFLICT") {
      resolvedCode = messageOrCode;
      resolvedMessage = codeOrMessage;
    } else if (/^[A-Z0-9_]+$/.test(codeOrMessage)) {
      resolvedMessage = messageOrCode;
      resolvedCode = codeOrMessage;
    } else {
      resolvedMessage = messageOrCode;
      resolvedCode = "CONFLICT";
    }

    super(resolvedMessage);
    this.name = "ConflictError";
    this.code = resolvedCode;
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class QuoteExpiredError extends Error {
  readonly status = 409;
  readonly statusCode = 409;
  readonly code = "QUOTE_EXPIRED";

  constructor(message = "Quote has expired", public readonly statusOverride?: number) {
    super(message);
    this.name = "QuoteExpiredError";
    Object.setPrototypeOf(this, QuoteExpiredError.prototype);
  }
}

export class InvalidQuoteError extends Error {
  readonly status = 400;
  readonly statusCode = 400;
  readonly code = "INVALID_QUOTE";

  constructor(message = "Invalid quote token") {
    super(message);
    this.name = "InvalidQuoteError";
    Object.setPrototypeOf(this, InvalidQuoteError.prototype);
  }
}

export class OfferNotFoundError extends Error {
  readonly status = 404;
  readonly statusCode = 404;
  readonly code = "OFFER_NOT_FOUND";

  constructor(message = "Pricing tier offer not found") {
    super(message);
    this.name = "OfferNotFoundError";
    Object.setPrototypeOf(this, OfferNotFoundError.prototype);
  }
}

export class OrderNotFoundError extends Error {
  readonly status = 404;
  readonly statusCode = 404;
  readonly code = "ORDER_NOT_FOUND";

  constructor(message = "Order not found") {
    super(message);
    this.name = "OrderNotFoundError";
    Object.setPrototypeOf(this, OrderNotFoundError.prototype);
  }
}

export class ValidationError extends Error {
  readonly status = 400;
  readonly statusCode = 400;
  readonly code = "VALIDATION_ERROR";

  constructor(message = "Validation failed") {
    super(message);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export { ForbiddenError, UnauthorizedError } from "@/modules/identity/types";
