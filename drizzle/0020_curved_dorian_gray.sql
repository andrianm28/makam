CREATE TABLE "inventory_plot_hold" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lokasi_id" uuid NOT NULL,
	"petak_id" uuid,
	"kavling_id" uuid,
	"nomor_pemesanan" text NOT NULL,
	"sampai" timestamp with time zone,
	"placed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "inventory_plot_hold_unit_check" CHECK (("inventory_plot_hold"."petak_id" is not null and "inventory_plot_hold"."kavling_id" is null) or ("inventory_plot_hold"."petak_id" is null and "inventory_plot_hold"."kavling_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "pemesanan_terencana" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nomor" text NOT NULL,
	"status" text NOT NULL,
	"lokasi_id" uuid NOT NULL,
	"lokasi_name" text NOT NULL,
	"pemesan_account_id" text NOT NULL,
	"pemesan_name" text NOT NULL,
	"email" text NOT NULL,
	"phone_number" text NOT NULL,
	"pemegang_hak" jsonb NOT NULL,
	"calon_penghuni" jsonb NOT NULL,
	"syarat" jsonb NOT NULL,
	"konfirmasi_due_at" timestamp with time zone,
	"tagihan_id" text,
	"alasan" text,
	"diajukan_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pemesanan_terencana_unit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pemesanan_id" uuid NOT NULL,
	"lokasi_id" uuid NOT NULL,
	"petak_id" uuid,
	"kavling_id" uuid,
	"nomor_makam" text,
	"nomor_kavling" text,
	"jenis_makam_id" uuid NOT NULL,
	"jenis_makam_name" text NOT NULL,
	"urutan" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_plot_hold" ADD CONSTRAINT "inventory_plot_hold_petak_id_inventory_petak_id_fk" FOREIGN KEY ("petak_id") REFERENCES "public"."inventory_petak"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_plot_hold" ADD CONSTRAINT "inventory_plot_hold_kavling_id_inventory_kavling_id_fk" FOREIGN KEY ("kavling_id") REFERENCES "public"."inventory_kavling"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pemesanan_terencana_unit" ADD CONSTRAINT "pemesanan_terencana_unit_pemesanan_id_pemesanan_terencana_id_fk" FOREIGN KEY ("pemesanan_id") REFERENCES "public"."pemesanan_terencana"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_plot_hold_petak_idx" ON "inventory_plot_hold" USING btree ("petak_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_plot_hold_kavling_idx" ON "inventory_plot_hold" USING btree ("kavling_id");--> statement-breakpoint
CREATE INDEX "inventory_plot_hold_lokasi_idx" ON "inventory_plot_hold" USING btree ("lokasi_id");--> statement-breakpoint
CREATE INDEX "inventory_plot_hold_nomor_idx" ON "inventory_plot_hold" USING btree ("nomor_pemesanan");--> statement-breakpoint
CREATE UNIQUE INDEX "pemesanan_terencana_nomor_idx" ON "pemesanan_terencana" USING btree ("nomor");--> statement-breakpoint
CREATE INDEX "pemesanan_terencana_pemesan_idx" ON "pemesanan_terencana" USING btree ("pemesan_account_id");--> statement-breakpoint
CREATE INDEX "pemesanan_terencana_lokasi_idx" ON "pemesanan_terencana" USING btree ("lokasi_id");--> statement-breakpoint
CREATE INDEX "pemesanan_terencana_unit_pemesanan_idx" ON "pemesanan_terencana_unit" USING btree ("pemesanan_id");--> statement-breakpoint
CREATE INDEX "pemesanan_terencana_unit_petak_idx" ON "pemesanan_terencana_unit" USING btree ("petak_id");--> statement-breakpoint
CREATE INDEX "pemesanan_terencana_unit_kavling_idx" ON "pemesanan_terencana_unit" USING btree ("kavling_id");