CREATE TABLE "audit_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"actor_account_id" text NOT NULL,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"entity_kind" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text
);
--> statement-breakpoint
CREATE INDEX "audit_entry_entity_idx" ON "audit_entry" USING btree ("entity_kind","entity_id","at");--> statement-breakpoint
CREATE INDEX "audit_entry_at_idx" ON "audit_entry" USING btree ("at");