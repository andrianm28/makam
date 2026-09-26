CREATE TABLE "tariff_biaya_pemakaman_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"effective_on" date NOT NULL,
	"in_force_from" timestamp with time zone NOT NULL,
	"entered_at" timestamp with time zone NOT NULL,
	"entered_by_account_id" text NOT NULL,
	"lokasi_id" uuid NOT NULL,
	"biaya_pemakaman" bigint NOT NULL,
	"biaya_pemakaman_tumpang" bigint,
	CONSTRAINT "tariff_biaya_pemakaman_version_amounts_check" CHECK ("tariff_biaya_pemakaman_version"."biaya_pemakaman" between 0 and 100000000000 and ("tariff_biaya_pemakaman_version"."biaya_pemakaman_tumpang" is null or "tariff_biaya_pemakaman_version"."biaya_pemakaman_tumpang" between 0 and 100000000000))
);
--> statement-breakpoint
CREATE TABLE "tariff_check" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"lokasi_id" uuid NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"checked_by_account_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tariff_global_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"effective_on" date NOT NULL,
	"in_force_from" timestamp with time zone NOT NULL,
	"entered_at" timestamp with time zone NOT NULL,
	"entered_by_account_id" text NOT NULL,
	"key" text NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "tariff_global_version_amount_check" CHECK ("tariff_global_version"."amount" between 0 and 100000000000)
);
--> statement-breakpoint
CREATE TABLE "tariff_jenis_makam" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lokasi_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by_account_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tariff_jenis_makam_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"effective_on" date NOT NULL,
	"in_force_from" timestamp with time zone NOT NULL,
	"entered_at" timestamp with time zone NOT NULL,
	"entered_by_account_id" text NOT NULL,
	"jenis_makam_id" uuid NOT NULL,
	"lokasi_id" uuid NOT NULL,
	"harga_hak_pakai" bigint NOT NULL,
	"tenure_years" integer,
	"harga_perpanjangan" bigint,
	CONSTRAINT "tariff_jenis_makam_version_amounts_check" CHECK ("tariff_jenis_makam_version"."harga_hak_pakai" between 0 and 100000000000 and ("tariff_jenis_makam_version"."harga_perpanjangan" is null or "tariff_jenis_makam_version"."harga_perpanjangan" between 0 and 100000000000)),
	CONSTRAINT "tariff_jenis_makam_version_tenure_check" CHECK (("tariff_jenis_makam_version"."tenure_years" is null and "tariff_jenis_makam_version"."harga_perpanjangan" is null) or ("tariff_jenis_makam_version"."tenure_years" >= 1 and "tariff_jenis_makam_version"."harga_perpanjangan" is not null))
);
--> statement-breakpoint
ALTER TABLE "tariff_jenis_makam_version" ADD CONSTRAINT "tariff_jenis_makam_version_jenis_makam_id_tariff_jenis_makam_id_fk" FOREIGN KEY ("jenis_makam_id") REFERENCES "public"."tariff_jenis_makam"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tariff_biaya_pemakaman_version_idx" ON "tariff_biaya_pemakaman_version" USING btree ("lokasi_id","in_force_from","seq");--> statement-breakpoint
CREATE INDEX "tariff_check_lokasi_idx" ON "tariff_check" USING btree ("lokasi_id","seq");--> statement-breakpoint
CREATE INDEX "tariff_global_version_key_idx" ON "tariff_global_version" USING btree ("key","in_force_from","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "tariff_jenis_makam_lokasi_name_idx" ON "tariff_jenis_makam" USING btree ("lokasi_id","name_key");--> statement-breakpoint
CREATE INDEX "tariff_jenis_makam_version_idx" ON "tariff_jenis_makam_version" USING btree ("jenis_makam_id","in_force_from","seq");--> statement-breakpoint
CREATE FUNCTION "tariff_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "tariff_global_version_no_update_or_delete" BEFORE UPDATE OR DELETE ON "tariff_global_version" FOR EACH ROW EXECUTE FUNCTION "tariff_append_only"();--> statement-breakpoint
CREATE TRIGGER "tariff_jenis_makam_version_no_update_or_delete" BEFORE UPDATE OR DELETE ON "tariff_jenis_makam_version" FOR EACH ROW EXECUTE FUNCTION "tariff_append_only"();--> statement-breakpoint
CREATE TRIGGER "tariff_biaya_pemakaman_version_no_update_or_delete" BEFORE UPDATE OR DELETE ON "tariff_biaya_pemakaman_version" FOR EACH ROW EXECUTE FUNCTION "tariff_append_only"();--> statement-breakpoint
CREATE TRIGGER "tariff_check_no_update_or_delete" BEFORE UPDATE OR DELETE ON "tariff_check" FOR EACH ROW EXECUTE FUNCTION "tariff_append_only"();
