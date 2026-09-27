CREATE TABLE "layanan_layanan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"description" text NOT NULL,
	"bukti" text NOT NULL,
	"lead_time_days" integer NOT NULL,
	"bisa_hari_h" boolean NOT NULL,
	"ada_di_petak_kosong" boolean NOT NULL,
	"teks_label" text,
	"created_at" timestamp with time zone NOT NULL,
	"created_by_account_id" text NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "layanan_layanan_lead_time_check" CHECK ("layanan_layanan"."lead_time_days" between 0 and 365)
);
--> statement-breakpoint
CREATE TABLE "layanan_paket" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"description" text NOT NULL,
	"frekuensi" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by_account_id" text NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "layanan_paket_item" (
	"paket_id" uuid NOT NULL,
	"layanan_variant_id" uuid NOT NULL,
	"posisi" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "layanan_penawaran" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lokasi_id" uuid NOT NULL,
	"layanan_variant_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by_account_id" text NOT NULL,
	"stopped_at" timestamp with time zone,
	"stopped_by_account_id" text
);
--> statement-breakpoint
CREATE TABLE "layanan_varian" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"layanan_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"boleh_di_tpu" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by_account_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tariff_layanan_dki_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"effective_on" date NOT NULL,
	"in_force_from" timestamp with time zone NOT NULL,
	"entered_at" timestamp with time zone NOT NULL,
	"entered_by_account_id" text NOT NULL,
	"layanan_variant_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "tariff_layanan_dki_version_amount_check" CHECK ("tariff_layanan_dki_version"."amount" between 0 and 100000000000)
);
--> statement-breakpoint
CREATE TABLE "tariff_layanan_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"effective_on" date NOT NULL,
	"in_force_from" timestamp with time zone NOT NULL,
	"entered_at" timestamp with time zone NOT NULL,
	"entered_by_account_id" text NOT NULL,
	"lokasi_id" uuid NOT NULL,
	"layanan_variant_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "tariff_layanan_version_amount_check" CHECK ("tariff_layanan_version"."amount" between 0 and 100000000000)
);
--> statement-breakpoint
CREATE TABLE "tariff_mitra_jasa_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"effective_on" date NOT NULL,
	"in_force_from" timestamp with time zone NOT NULL,
	"entered_at" timestamp with time zone NOT NULL,
	"entered_by_account_id" text NOT NULL,
	"layanan_variant_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "tariff_mitra_jasa_version_amount_check" CHECK ("tariff_mitra_jasa_version"."amount" between 0 and 100000000000)
);
--> statement-breakpoint
ALTER TABLE "layanan_paket_item" ADD CONSTRAINT "layanan_paket_item_paket_id_layanan_paket_id_fk" FOREIGN KEY ("paket_id") REFERENCES "public"."layanan_paket"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layanan_paket_item" ADD CONSTRAINT "layanan_paket_item_layanan_variant_id_layanan_varian_id_fk" FOREIGN KEY ("layanan_variant_id") REFERENCES "public"."layanan_varian"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layanan_penawaran" ADD CONSTRAINT "layanan_penawaran_layanan_variant_id_layanan_varian_id_fk" FOREIGN KEY ("layanan_variant_id") REFERENCES "public"."layanan_varian"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "layanan_varian" ADD CONSTRAINT "layanan_varian_layanan_id_layanan_layanan_id_fk" FOREIGN KEY ("layanan_id") REFERENCES "public"."layanan_layanan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "layanan_layanan_name_idx" ON "layanan_layanan" USING btree ("name_key");--> statement-breakpoint
CREATE INDEX "layanan_paket_item_paket_idx" ON "layanan_paket_item" USING btree ("paket_id","posisi");--> statement-breakpoint
CREATE UNIQUE INDEX "layanan_penawaran_lokasi_varian_idx" ON "layanan_penawaran" USING btree ("lokasi_id","layanan_variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "layanan_varian_layanan_name_idx" ON "layanan_varian" USING btree ("layanan_id","name_key");--> statement-breakpoint
CREATE INDEX "tariff_layanan_dki_version_idx" ON "tariff_layanan_dki_version" USING btree ("layanan_variant_id","in_force_from","seq");--> statement-breakpoint
CREATE INDEX "tariff_layanan_version_idx" ON "tariff_layanan_version" USING btree ("lokasi_id","layanan_variant_id","in_force_from","seq");--> statement-breakpoint
CREATE INDEX "tariff_mitra_jasa_version_idx" ON "tariff_mitra_jasa_version" USING btree ("layanan_variant_id","in_force_from","seq");
--> statement-breakpoint
-- The three Layanan price books are versioned like the rest of the Tariffs module: an old price is read back, never rewritten (the function comes from the tariffs migration).
CREATE TRIGGER "tariff_layanan_version_no_update_or_delete" BEFORE UPDATE OR DELETE ON "tariff_layanan_version" FOR EACH ROW EXECUTE FUNCTION "tariff_append_only"();--> statement-breakpoint
CREATE TRIGGER "tariff_layanan_dki_version_no_update_or_delete" BEFORE UPDATE OR DELETE ON "tariff_layanan_dki_version" FOR EACH ROW EXECUTE FUNCTION "tariff_append_only"();--> statement-breakpoint
CREATE TRIGGER "tariff_mitra_jasa_version_no_update_or_delete" BEFORE UPDATE OR DELETE ON "tariff_mitra_jasa_version" FOR EACH ROW EXECUTE FUNCTION "tariff_append_only"();