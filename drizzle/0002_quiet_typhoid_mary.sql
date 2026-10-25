ALTER TYPE "public"."order_status" ADD VALUE 'INVOICE_CREATING' BEFORE 'pending';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'AWAITING_PAYMENT' BEFORE 'pending';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'CREATE_UNKNOWN' BEFORE 'pending';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'PAID' BEFORE 'pending';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'EXPIRED' BEFORE 'pending';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'FAILED' BEFORE 'pending';--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'CANCELLED' BEFORE 'pending';