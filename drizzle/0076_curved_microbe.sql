CREATE TABLE "tariff_biaya_pemakaman_jenis_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"effective_on" date NOT NULL,
	"in_force_from" timestamp with time zone NOT NULL,
	"entered_at" timestamp with time zone NOT NULL,
	"entered_by_account_id" text NOT NULL,
	"jenis_makam_id" uuid NOT NULL,
	"lokasi_id" uuid NOT NULL,
	"biaya_pemakaman" bigint,
	CONSTRAINT "tariff_biaya_pemakaman_jenis_version_amount_check" CHECK ("tariff_biaya_pemakaman_jenis_version"."biaya_pemakaman" is null or "tariff_biaya_pemakaman_jenis_version"."biaya_pemakaman" between 0 and 100000000000)
);
--> statement-breakpoint
CREATE TABLE "tariff_jenis_makam_keterangan" (
	"jenis_makam_id" uuid PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by_account_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tariff_biaya_pemakaman_jenis_version" ADD CONSTRAINT "tariff_biaya_pemakaman_jenis_version_jenis_makam_id_tariff_jenis_makam_id_fk" FOREIGN KEY ("jenis_makam_id") REFERENCES "public"."tariff_jenis_makam"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_jenis_makam_keterangan" ADD CONSTRAINT "tariff_jenis_makam_keterangan_jenis_makam_id_tariff_jenis_makam_id_fk" FOREIGN KEY ("jenis_makam_id") REFERENCES "public"."tariff_jenis_makam"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tariff_biaya_pemakaman_jenis_version_idx" ON "tariff_biaya_pemakaman_jenis_version" USING btree ("jenis_makam_id","in_force_from","seq");--> statement-breakpoint
CREATE TRIGGER "tariff_biaya_pemakaman_jenis_version_no_update_or_delete" BEFORE UPDATE OR DELETE ON "tariff_biaya_pemakaman_jenis_version" FOR EACH ROW EXECUTE FUNCTION "tariff_append_only"();
