CREATE TYPE "public"."user_role" AS ENUM('reader', 'editor', 'publisher', 'admin');--> statement-breakpoint
CREATE TYPE "public"."book_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."register_type" AS ENUM('standard', 'casual');--> statement-breakpoint
CREATE TYPE "public"."tier_status" AS ENUM('active', 'inactive', 'archived');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'paid', 'expired', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."refund_record_status" AS ENUM('pending', 'confirmed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('none', 'partial', 'full', 'review');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'processing', 'retry', 'completed', 'failed', 'dead');--> statement-breakpoint
CREATE TYPE "public"."webhook_status" AS ENUM('pending', 'processing', 'retry', 'processed', 'rejected', 'dead');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('pdf', 'cover', 'poster');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "locales" (
	"code" varchar(16) PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"direction" varchar(3) DEFAULT 'ltr' NOT NULL,
	"fallback_code" varchar(16)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"preferences_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role" "user_role" NOT NULL,
	"assigned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(128) NOT NULL,
	"status" "book_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "books_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "chapter_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chapter_id" uuid NOT NULL,
	"locale" varchar(16) NOT NULL,
	"register" "register_type" DEFAULT 'standard' NOT NULL,
	"published_revision_id" uuid,
	"generation" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "casual_locale_check" CHECK ("register" != 'casual' OR "locale" = 'id')
);
--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"slug" varchar(128) NOT NULL,
	"is_free_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chapters_index_range_check" CHECK ("index" >= 0 AND "index" <= 14),
	CONSTRAINT "chapters_free_sample_check" CHECK ("is_free_sample" = ("index" IN (0, 1)))
);
--> statement-breakpoint
CREATE TABLE "pricing_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"amount_idr" bigint NOT NULL,
	"status" "tier_status" DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"terms_version" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pricing_tiers_code_unique" UNIQUE("code"),
	CONSTRAINT "pricing_tiers_amount_idr_check" CHECK ("amount_idr" > 0)
);
--> statement-breakpoint
CREATE TABLE "tier_books" (
	"tier_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	CONSTRAINT "tier_books_tier_id_book_id_pk" PRIMARY KEY("tier_id","book_id")
);
--> statement-breakpoint
CREATE TABLE "content_drafts" (
	"variant_id" uuid PRIMARY KEY NOT NULL,
	"source_md" text NOT NULL,
	"identity_manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"source_md" text NOT NULL,
	"source_sha256" varchar(64) NOT NULL,
	"manifest_sha256" varchar(64) NOT NULL,
	"compiler_version" varchar(32) NOT NULL,
	"sanitizer_version" varchar(32) NOT NULL,
	"html" text NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dictionary_publications" (
	"locale" varchar(16) PRIMARY KEY NOT NULL,
	"revision_id" uuid NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dictionary_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"locale" varchar(16) NOT NULL,
	"messages_json" jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "published_previews" (
	"variant_id" uuid PRIMARY KEY NOT NULL,
	"preview_text" text NOT NULL,
	"preview_html" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chapter_id" uuid NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_progress" (
	"user_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checklist_progress_user_id_item_id_pk" PRIMARY KEY("user_id","item_id"),
	CONSTRAINT "checklist_progress_version_check" CHECK ("version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "reading_progress" (
	"user_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"chapter_id" uuid NOT NULL,
	"revision_id" uuid,
	"anchor_id" varchar(128),
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reading_progress_user_id_book_id_pk" PRIMARY KEY("user_id","book_id")
);
--> statement-breakpoint
CREATE TABLE "revision_checklist_items" (
	"revision_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"label_text" text NOT NULL,
	CONSTRAINT "revision_checklist_items_revision_id_item_id_pk" PRIMARY KEY("revision_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "checkout_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_scope_hash" varchar(64) NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"order_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"granted_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"book_title_snapshot" text NOT NULL,
	"offer_id_snapshot" varchar(64) NOT NULL,
	"price" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_user_id" uuid,
	"buyer_email" varchar(255) NOT NULL,
	"buyer_name" varchar(255) NOT NULL,
	"buyer_mobile" varchar(32) NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"currency" varchar(3) DEFAULT 'IDR' NOT NULL,
	"subtotal" bigint NOT NULL,
	"discount" bigint DEFAULT 0 NOT NULL,
	"tax" bigint DEFAULT 0 NOT NULL,
	"payable" bigint NOT NULL,
	"terms_version" varchar(32) NOT NULL,
	"provider_env" varchar(32) NOT NULL,
	"merchant_id" varchar(128) NOT NULL,
	"invoice_id" varchar(128),
	"transaction_id" varchar(128),
	"paid_at" timestamp with time zone,
	"refund_status" "refund_status" DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_currency_idr_check" CHECK ("currency" = 'IDR'),
	CONSTRAINT "orders_payable_positive_check" CHECK ("payable" > 0),
	CONSTRAINT "orders_payable_calc_check" CHECK ("payable" = "subtotal" - "discount" + "tax")
);
--> statement-breakpoint
CREATE TABLE "purchase_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"claimed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_claims_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "purchase_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"book_id" uuid NOT NULL,
	"user_id" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text,
	CONSTRAINT "purchase_grants_order_item_id_unique" UNIQUE("order_item_id")
);
--> statement-breakpoint
CREATE TABLE "refund_items" (
	"refund_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"revoke_access" boolean DEFAULT true NOT NULL,
	CONSTRAINT "refund_items_refund_id_order_item_id_pk" PRIMARY KEY("refund_id","order_item_id")
);
--> statement-breakpoint
CREATE TABLE "refund_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider_reference" varchar(128),
	"amount" bigint NOT NULL,
	"status" "refund_record_status" DEFAULT 'pending' NOT NULL,
	"reason" text NOT NULL,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refund_records_amount_positive_check" CHECK ("amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "verified_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"provider_env" varchar(32) NOT NULL,
	"merchant_id" varchar(128) NOT NULL,
	"transaction_id" varchar(128) NOT NULL,
	"invoice_id" varchar(128) NOT NULL,
	"amount" bigint NOT NULL,
	"evidence_hash" varchar(64) NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(64) NOT NULL,
	"aggregate_id" varchar(128) NOT NULL,
	"dedupe_key" varchar(128) NOT NULL,
	"payload_json" jsonb NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_jobs_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "webhook_inbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_env" varchar(32) NOT NULL,
	"event_key" varchar(128) NOT NULL,
	"payload_hash" varchar(64) NOT NULL,
	"normalized_json" jsonb NOT NULL,
	"status" "webhook_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"error_code" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" uuid NOT NULL,
	"edition" varchar(32) NOT NULL,
	"locale" varchar(16) NOT NULL,
	"register" "register_type" DEFAULT 'standard' NOT NULL,
	"kind" "media_kind" NOT NULL,
	"object_key" varchar(255) NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"bytes" bigint NOT NULL,
	"mime" varchar(64) NOT NULL,
	"status" "media_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE TABLE "search_private" (
	"variant_id" uuid PRIMARY KEY NOT NULL,
	"revision_id" uuid NOT NULL,
	"text" text NOT NULL,
	"document" "tsvector" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_public" (
	"variant_id" uuid PRIMARY KEY NOT NULL,
	"revision_id" uuid NOT NULL,
	"title" text NOT NULL,
	"preview_text" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"document" "tsvector" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" varchar(64) NOT NULL,
	"aggregate_type" varchar(64) NOT NULL,
	"aggregate_id" varchar(128) NOT NULL,
	"reason" text,
	"request_id" varchar(64),
	"safe_diff_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "locales" ADD CONSTRAINT "locales_fallback_code_locales_code_fk" FOREIGN KEY ("fallback_code") REFERENCES "public"."locales"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_variants" ADD CONSTRAINT "chapter_variants_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_variants" ADD CONSTRAINT "chapter_variants_locale_locales_code_fk" FOREIGN KEY ("locale") REFERENCES "public"."locales"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier_books" ADD CONSTRAINT "tier_books_tier_id_pricing_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."pricing_tiers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tier_books" ADD CONSTRAINT "tier_books_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_variant_id_chapter_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."chapter_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_variant_id_chapter_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."chapter_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_publications" ADD CONSTRAINT "dictionary_publications_locale_locales_code_fk" FOREIGN KEY ("locale") REFERENCES "public"."locales"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_publications" ADD CONSTRAINT "dictionary_publications_revision_id_dictionary_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."dictionary_revisions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_revisions" ADD CONSTRAINT "dictionary_revisions_locale_locales_code_fk" FOREIGN KEY ("locale") REFERENCES "public"."locales"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_previews" ADD CONSTRAINT "published_previews_variant_id_chapter_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."chapter_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_progress" ADD CONSTRAINT "checklist_progress_item_id_checklist_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."checklist_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_revision_id_content_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."content_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_checklist_items" ADD CONSTRAINT "revision_checklist_items_revision_id_content_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."content_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_checklist_items" ADD CONSTRAINT "revision_checklist_items_item_id_checklist_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."checklist_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_requests" ADD CONSTRAINT "checkout_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_grants" ADD CONSTRAINT "manual_grants_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_claims" ADD CONSTRAINT "purchase_claims_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_grants" ADD CONSTRAINT "purchase_grants_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_grants" ADD CONSTRAINT "purchase_grants_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_refund_id_refund_records_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refund_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_records" ADD CONSTRAINT "refund_records_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verified_payments" ADD CONSTRAINT "verified_payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_locale_locales_code_fk" FOREIGN KEY ("locale") REFERENCES "public"."locales"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_private" ADD CONSTRAINT "search_private_variant_id_chapter_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."chapter_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_private" ADD CONSTRAINT "search_private_revision_id_content_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."content_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_public" ADD CONSTRAINT "search_public_variant_id_chapter_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."chapter_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_public" ADD CONSTRAINT "search_public_revision_id_content_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."content_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chapter_variants_unique" ON "chapter_variants" USING btree ("chapter_id","locale","register");--> statement-breakpoint
CREATE UNIQUE INDEX "chapters_book_id_index_unique" ON "chapters" USING btree ("book_id","index");--> statement-breakpoint
CREATE UNIQUE INDEX "chapters_book_id_slug_unique" ON "chapters" USING btree ("book_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "content_revisions_variant_id_id_unique" ON "content_revisions" USING btree ("variant_id","id");--> statement-breakpoint
CREATE INDEX "content_revisions_variant_created_idx" ON "content_revisions" USING btree ("variant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dictionary_revisions_locale_id_unique" ON "dictionary_revisions" USING btree ("locale","id");--> statement-breakpoint
CREATE INDEX "checklist_items_chapter_id_idx" ON "checklist_items" USING btree ("chapter_id");--> statement-breakpoint
CREATE INDEX "checklist_progress_user_updated_idx" ON "checklist_progress" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rev_checklist_items_rev_ordinal_unique" ON "revision_checklist_items" USING btree ("revision_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_requests_actor_idempotency_unique" ON "checkout_requests" USING btree ("actor_scope_hash","idempotency_key");--> statement-breakpoint
CREATE INDEX "manual_grants_user_book_expires_idx" ON "manual_grants" USING btree ("user_id","book_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_order_book_unique" ON "order_items" USING btree ("order_id","book_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_provider_merchant_invoice_unique" ON "orders" USING btree ("provider_env","merchant_id","invoice_id") WHERE "invoice_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "orders_status_created_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_buyer_user_created_idx" ON "orders" USING btree ("buyer_user_id","created_at");--> statement-breakpoint
CREATE INDEX "purchase_grants_user_book_active_idx" ON "purchase_grants" USING btree ("user_id","book_id") WHERE "revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "verified_payments_provider_merchant_txn_unique" ON "verified_payments" USING btree ("provider_env","merchant_id","transaction_id");--> statement-breakpoint
CREATE INDEX "outbox_jobs_status_next_attempt_idx" ON "outbox_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_inbox_provider_env_event_key_unique" ON "webhook_inbox" USING btree ("provider_env","event_key");--> statement-breakpoint
CREATE INDEX "webhook_inbox_status_next_attempt_idx" ON "webhook_inbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "search_private_document_gin_idx" ON "search_private" USING gin ("document");--> statement-breakpoint
CREATE INDEX "search_public_document_gin_idx" ON "search_public" USING gin ("document");--> statement-breakpoint
CREATE INDEX "audit_events_agg_created_idx" ON "audit_events" USING btree ("aggregate_type","aggregate_id","created_at");