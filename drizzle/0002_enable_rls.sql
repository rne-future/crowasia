ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "locales" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "books" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chapters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chapter_variants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "content_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "published_previews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "checklist_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "revision_checklist_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "checklist_progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reading_progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dictionary_revisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dictionary_publications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pricing_tiers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tier_books" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "checkout_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "verified_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "manual_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_claims" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "refund_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "refund_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webhook_inbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outbox_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "search_public" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "search_private" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "Allow public read on enabled locales" ON "locales" FOR SELECT USING (enabled = true);--> statement-breakpoint
CREATE POLICY "Allow public read on published books" ON "books" FOR SELECT USING (status = 'published');--> statement-breakpoint
CREATE POLICY "Allow public read on chapters of published books" ON "chapters" FOR SELECT USING (true);--> statement-breakpoint
CREATE POLICY "Allow public read on published previews" ON "published_previews" FOR SELECT USING (true);--> statement-breakpoint
CREATE POLICY "Allow public read on active pricing tiers" ON "pricing_tiers" FOR SELECT USING (status = 'active');--> statement-breakpoint
CREATE POLICY "Allow public read on tier books" ON "tier_books" FOR SELECT USING (true);--> statement-breakpoint
CREATE POLICY "Allow public read on search public" ON "search_public" FOR SELECT USING (true);
