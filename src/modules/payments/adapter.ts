import { createHash } from "node:crypto";
import { env } from "@/shared/config/env";
import {
  type CreateInvoiceInput,
  type MayarClientConfig,
  type MayarInvoice,
  type MayarTransaction,
  type OrderSnapshot,
  type VerifiedPaymentData,
  AmountMismatchError,
  MayarApiError,
  PaymentVerificationError,
} from "./types";

interface MayarEnvelope<T> {
  statusCode?: number;
  messages?: string | string[];
  data?: T;
}

interface RawInvoiceData {
  id?: string;
  transactionId?: string | null;
  amount?: number | string;
  status?: string;
  link?: string;
  paymentUrl?: string;
  customer?: {
    name?: string;
    email?: string;
    mobile?: string;
  };
  extraData?: Record<string, unknown> | null;
  expiredAt?: string | null;
  userId?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface RawTransactionData {
  id?: string;
  amount?: number | string;
  status?: string;
  paymentLink?: { id?: string; status?: string } | null;
  customer?: {
    name?: string;
    email?: string;
    mobile?: string;
  };
  userId?: string;
}

export class MayarClient {
  public readonly apiKey: string;
  public readonly baseUrl: string;
  public readonly environment: string;

  constructor(config?: MayarClientConfig) {
    this.apiKey = config?.apiKey ?? env.MAYAR_API_KEY ?? "";
    this.environment =
      config?.environment ??
      (env.APP_ENV === "production" ? "production" : "sandbox");

    if (config?.baseUrl) {
      this.baseUrl = config.baseUrl;
    } else if (env.MAYAR_BASE_URL) {
      this.baseUrl = env.MAYAR_BASE_URL;
    } else if (this.environment === "production") {
      this.baseUrl = "https://api.mayar.id/hl/v2";
    } else {
      this.baseUrl = "https://api.mayar.io/hl/v2";
    }
  }

  private mapRawInvoice(raw: RawInvoiceData): MayarInvoice {
    if (!raw.id) {
      throw new PaymentVerificationError("Invalid invoice response: missing id");
    }
    const rawAmount = raw.amount !== undefined ? BigInt(raw.amount) : 0n;

    return {
      id: raw.id,
      transactionId: raw.transactionId ?? null,
      amount: rawAmount,
      status: raw.status ?? "unknown",
      link: raw.link ?? raw.paymentUrl ?? "",
      paymentUrl: raw.paymentUrl ?? raw.link ?? "",
      customer: raw.customer,
      extraData: raw.extraData,
      expiredAt: raw.expiredAt,
      userId: raw.userId,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  private mapRawTransaction(raw: RawTransactionData): MayarTransaction {
    if (!raw.id) {
      throw new PaymentVerificationError("Invalid transaction response: missing id");
    }
    const rawAmount = raw.amount !== undefined ? BigInt(raw.amount) : 0n;

    return {
      id: raw.id,
      amount: rawAmount,
      status: raw.status ?? "unknown",
      paymentLink: raw.paymentLink,
      customer: raw.customer,
      userId: raw.userId,
    };
  }

  public async createInvoice(input: CreateInvoiceInput): Promise<MayarInvoice> {
    const url = `${this.baseUrl}/invoices/create`;
    const payload = {
      name: input.name,
      email: input.email,
      mobile: input.mobile,
      description: input.description,
      redirectUrl: input.redirectUrl,
      extraData: { orderId: input.orderId },
      items: [
        {
          description: input.description,
          quantity: 1,
          rate: Number(input.amount),
        },
      ],
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }
      throw new MayarApiError(
        `Mayar createInvoice failed with HTTP ${response.status}`,
        response.status,
        errorBody
      );
    }

    const json = (await response.json()) as MayarEnvelope<RawInvoiceData>;
    const data = json.data ?? (json as unknown as RawInvoiceData);
    return this.mapRawInvoice(data);
  }

  public async getInvoice(invoiceId: string): Promise<MayarInvoice> {
    const url = `${this.baseUrl}/invoices/${encodeURIComponent(invoiceId)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }
      throw new MayarApiError(
        `Mayar getInvoice failed with HTTP ${response.status}`,
        response.status,
        errorBody
      );
    }

    const json = (await response.json()) as MayarEnvelope<RawInvoiceData>;
    const data = json.data ?? (json as unknown as RawInvoiceData);
    return this.mapRawInvoice(data);
  }

  public async getTransaction(transactionId: string): Promise<MayarTransaction> {
    const url = `${this.baseUrl}/transactions/${encodeURIComponent(transactionId)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }
      throw new MayarApiError(
        `Mayar getTransaction failed with HTTP ${response.status}`,
        response.status,
        errorBody
      );
    }

    const json = (await response.json()) as MayarEnvelope<RawTransactionData>;
    const data = json.data ?? (json as unknown as RawTransactionData);
    return this.mapRawTransaction(data);
  }

  public async verifyPayment(
    orderSnapshot: OrderSnapshot,
    invoiceId: string
  ): Promise<VerifiedPaymentData> {
    if (orderSnapshot.currency !== "IDR") {
      throw new PaymentVerificationError(
        `Unsupported order currency '${orderSnapshot.currency}', expected 'IDR'`
      );
    }

    const invoice = await this.getInvoice(invoiceId);

    if (invoice.status !== "paid") {
      throw new PaymentVerificationError(
        `Invoice status is '${invoice.status}', expected 'paid'`
      );
    }

    if (invoice.amount !== orderSnapshot.payable) {
      throw new AmountMismatchError(orderSnapshot.payable, invoice.amount);
    }

    if (invoice.extraData?.orderId && invoice.extraData.orderId !== orderSnapshot.orderId) {
      throw new PaymentVerificationError(
        `Invoice orderId mismatch: expected '${orderSnapshot.orderId}', received '${invoice.extraData.orderId}'`
      );
    }

    if (!invoice.transactionId) {
      throw new PaymentVerificationError(
        "Transaction ID missing from paid invoice"
      );
    }

    const transaction = await this.getTransaction(invoice.transactionId);

    if (transaction.status !== "paid") {
      throw new PaymentVerificationError(
        `Linked transaction status is '${transaction.status}', expected 'paid'`
      );
    }

    if (transaction.amount !== orderSnapshot.payable) {
      throw new AmountMismatchError(orderSnapshot.payable, transaction.amount);
    }

    const merchantId = invoice.userId ?? "default";

    const canonicalEvidence = JSON.stringify({
      adapterContractVersion: "2.0",
      environment: this.environment,
      invoiceId: invoice.id,
      merchantId,
      orderId: orderSnapshot.orderId,
      payableIdr: invoice.amount.toString(),
      status: invoice.status,
      transactionId: transaction.id,
    });

    const evidenceHash = createHash("sha256")
      .update(canonicalEvidence)
      .digest("hex");

    return {
      provider: "mayar",
      environment: this.environment,
      merchantId,
      invoiceId: invoice.id,
      transactionId: transaction.id,
      orderId: orderSnapshot.orderId,
      payableIdr: invoice.amount,
      amount: invoice.amount,
      currency: "IDR",
      evidenceHash,
      verifiedAt: new Date(),
      adapterContractVersion: "2.0",
    };
  }
}

let defaultClient: MayarClient | null = null;

export function getMayarClient(config?: MayarClientConfig): MayarClient {
  if (config) {
    return new MayarClient(config);
  }
  if (!defaultClient) {
    defaultClient = new MayarClient();
  }
  return defaultClient;
}

export async function createInvoice(input: CreateInvoiceInput, client = getMayarClient()): Promise<MayarInvoice> {
  return client.createInvoice(input);
}

export async function getInvoice(invoiceId: string, client = getMayarClient()): Promise<MayarInvoice> {
  return client.getInvoice(invoiceId);
}

export async function getTransaction(transactionId: string, client = getMayarClient()): Promise<MayarTransaction> {
  return client.getTransaction(transactionId);
}

export async function verifyPayment(
  orderSnapshot: OrderSnapshot,
  invoiceId: string,
  client = getMayarClient()
): Promise<VerifiedPaymentData> {
  return client.verifyPayment(orderSnapshot, invoiceId);
}
