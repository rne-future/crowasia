import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MayarClient,
  getMayarClient,
} from "@/modules/payments/adapter";
import {
  AmountMismatchError,
  PaymentVerificationError,
  MayarApiError,
  type CreateInvoiceInput,
  type OrderSnapshot,
} from "@/modules/payments/types";
import paidInvoiceFixture from "../../fixtures/payments/mayar-invoice-paid.json";

describe("Mayar V2 Adapter (TDD)", () => {
  const apiKey = "test_api_key_jwt";
  const baseUrl = "https://api.mayar.io/hl/v2";
  let client: MayarClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = getMayarClient({
      apiKey,
      baseUrl,
      environment: "sandbox",
    });
  });

  describe("createInvoice", () => {
    it("sends POST to /invoices/create with correct headers and JSON body", async () => {
      const mockResponse = {
        statusCode: 200,
        messages: "Invoice created",
        data: {
          id: "inv_created_123",
          transactionId: null,
          amount: 150000,
          status: "unpaid",
          link: "https://mayar.link/inv/inv_created_123",
          paymentUrl: "https://mayar.link/inv/inv_created_123",
          customer: {
            name: "Harry",
            email: "harry@example.com",
            mobile: "08123456789",
          },
          extraData: { orderId: "ord_1" },
          userId: "usr_merchant_1",
          expiredAt: "2026-11-01T00:00:00.000Z",
        },
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const input: CreateInvoiceInput = {
        name: "Harry",
        email: "harry@example.com",
        mobile: "08123456789",
        amount: 150000n,
        description: "Crow Asia Book Purchase",
        orderId: "ord_1",
        redirectUrl: "https://crow.asia/orders/ord_1",
      };

      const result = await client.createInvoice(input);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://api.mayar.io/hl/v2/invoices/create");
      expect(options?.method).toBe("POST");
      expect(options?.headers).toEqual({
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      });

      const parsedBody = JSON.parse(options?.body as string);
      expect(parsedBody).toMatchObject({
        name: "Harry",
        email: "harry@example.com",
        mobile: "08123456789",
        description: "Crow Asia Book Purchase",
        redirectUrl: "https://crow.asia/orders/ord_1",
        extraData: { orderId: "ord_1" },
        items: [
          {
            description: "Crow Asia Book Purchase",
            quantity: 1,
            rate: 150000,
          },
        ],
      });

      expect(result.id).toBe("inv_created_123");
      expect(result.amount).toBe(150000n);
      expect(result.status).toBe("unpaid");
      expect(result.link).toBe("https://mayar.link/inv/inv_created_123");
    });

    it("throws MayarApiError when API responds with error status", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({ statusCode: 401, messages: "Unauthorized token" }),
          { status: 401 }
        )
      );

      const input: CreateInvoiceInput = {
        name: "Harry",
        email: "harry@example.com",
        mobile: "08123456789",
        amount: 50000n,
        description: "Test",
        orderId: "ord_fail",
      };

      await expect(client.createInvoice(input)).rejects.toThrow(MayarApiError);
    });
  });

  describe("getInvoice", () => {
    it("fetches GET /invoices/{id} and returns typed MayarInvoice with BigInt amount", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(paidInvoiceFixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const invoice = await client.getInvoice("inv_mock_12345");

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.mayar.io/hl/v2/invoices/inv_mock_12345",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );

      expect(invoice.id).toBe("inv_mock_12345");
      expect(invoice.transactionId).toBe("txn_mock_67890");
      expect(invoice.amount).toBe(150000n);
      expect(invoice.status).toBe("paid");
      expect(invoice.userId).toBe("usr_merchant_test_1");
    });

    it("throws MayarApiError when invoice is not found", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({ statusCode: 404, messages: "Invoice not found" }),
          { status: 404 }
        )
      );

      await expect(client.getInvoice("inv_missing")).rejects.toThrow(
        MayarApiError
      );
    });
  });

  describe("getTransaction", () => {
    it("fetches GET /transactions/{id} and returns MayarTransaction with BigInt amount", async () => {
      const mockTxnResponse = {
        statusCode: 200,
        messages: "Transaction details",
        data: {
          id: "txn_mock_67890",
          amount: 150000,
          status: "paid",
          paymentLink: { id: "link_1", status: "active" },
          customer: {
            name: "Harry",
            email: "harry@example.com",
            mobile: "08123456789",
          },
        },
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockTxnResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const txn = await client.getTransaction("txn_mock_67890");

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.mayar.io/hl/v2/transactions/txn_mock_67890",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        }
      );

      expect(txn.id).toBe("txn_mock_67890");
      expect(txn.amount).toBe(150000n);
      expect(txn.status).toBe("paid");
    });
  });

  describe("verifyPayment", () => {
    const orderSnapshot: OrderSnapshot = {
      orderId: "00000000-0000-0000-0000-000000000001",
      payable: 150000n,
      currency: "IDR",
      buyerEmail: "mharryrosyan@gmail.com",
    };

    it("verifies paid invoice and returns typed VerifiedPaymentData", async () => {
      // 1. mock invoice lookup
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response(JSON.stringify(paidInvoiceFixture), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        )
        // 2. mock transaction lookup
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              statusCode: 200,
              data: {
                id: "txn_mock_67890",
                amount: 150000,
                status: "paid",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );

      const verified = await client.verifyPayment(
        orderSnapshot,
        "inv_mock_12345"
      );

      expect(verified).toMatchObject({
        provider: "mayar",
        environment: "sandbox",
        merchantId: "usr_merchant_test_1",
        invoiceId: "inv_mock_12345",
        transactionId: "txn_mock_67890",
        payableIdr: 150000n,
        currency: "IDR",
        adapterContractVersion: "2.0",
      });
      expect(typeof verified.evidenceHash).toBe("string");
      expect(verified.evidenceHash.length).toBe(64); // sha256 hex
      expect(verified.verifiedAt).toBeInstanceOf(Date);
    });

    it("throws AmountMismatchError if invoice amount differs by +1", async () => {
      const tampered = JSON.parse(JSON.stringify(paidInvoiceFixture));
      tampered.data.amount = 150001; // +1 mismatch

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(tampered), { status: 200 })
      );

      await expect(
        client.verifyPayment(orderSnapshot, "inv_mock_12345")
      ).rejects.toThrow(AmountMismatchError);
    });

    it("throws AmountMismatchError if invoice amount differs by -1", async () => {
      const tampered = JSON.parse(JSON.stringify(paidInvoiceFixture));
      tampered.data.amount = 149999; // -1 mismatch

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(tampered), { status: 200 })
      );

      await expect(
        client.verifyPayment(orderSnapshot, "inv_mock_12345")
      ).rejects.toThrow(AmountMismatchError);
    });

    it("throws PaymentVerificationError if invoice status is not paid", async () => {
      const unpaid = JSON.parse(JSON.stringify(paidInvoiceFixture));
      unpaid.data.status = "unpaid";

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(unpaid), { status: 200 })
      );

      await expect(
        client.verifyPayment(orderSnapshot, "inv_mock_12345")
      ).rejects.toThrow(PaymentVerificationError);
    });

    it("throws PaymentVerificationError if snapshot currency is not IDR", async () => {
      const nonIdrSnapshot: OrderSnapshot = {
        ...orderSnapshot,
        currency: "USD",
      };

      await expect(
        client.verifyPayment(nonIdrSnapshot, "inv_mock_12345")
      ).rejects.toThrow(PaymentVerificationError);
    });

    it("throws PaymentVerificationError if linked transaction status is not paid", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
          new Response(JSON.stringify(paidInvoiceFixture), { status: 200 })
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              statusCode: 200,
              data: {
                id: "txn_mock_67890",
                amount: 150000,
                status: "pending",
              },
            }),
            { status: 200 }
          )
        );

      await expect(
        client.verifyPayment(orderSnapshot, "inv_mock_12345")
      ).rejects.toThrow(PaymentVerificationError);
    });
  });
});
