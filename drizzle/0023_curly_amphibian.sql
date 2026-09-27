CREATE TABLE "inventory_cari_makam_attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ip" text NOT NULL,
	"dicoba_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "inventory_cari_makam_attempt_ip_idx" ON "inventory_cari_makam_attempt" USING btree ("ip","dicoba_at");