ALTER TABLE "inventory_petak" ADD COLUMN "tidak_tersedia_reason" text;--> statement-breakpoint
CREATE TABLE "inventory_hak_pakai" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lokasi_id" uuid NOT NULL,
	"petak_id" uuid,
	"kavling_id" uuid,
	"status" text DEFAULT 'aktif' NOT NULL,
	"end_reason" text,
	"tenure_years" integer,
	"start_at" timestamp with time zone NOT NULL,
	"tenure_start_at" timestamp with time zone,
	"end_date" timestamp with time zone,
	"perlu_verifikasi" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by_account_id" text NOT NULL,
	CONSTRAINT "inventory_hak_pakai_target_check" CHECK (("inventory_hak_pakai"."petak_id" is not null and "inventory_hak_pakai"."kavling_id" is null) or ("inventory_hak_pakai"."petak_id" is null and "inventory_hak_pakai"."kavling_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "inventory_pemegang_hak" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hak_pakai_id" uuid NOT NULL,
	"name" text,
	"phone_number" text,
	"email" text,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone,
	"created_by_account_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_pemakaman" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lokasi_id" uuid NOT NULL,
	"petak_id" uuid NOT NULL,
	"hak_pakai_id" uuid NOT NULL,
	"almarhum_name" text NOT NULL,
	"date" date NOT NULL,
	"layer" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by_account_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_petak_alias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lokasi_id" uuid NOT NULL,
	"petak_id" uuid NOT NULL,
	"nomor_makam" text NOT NULL,
	"nomor_makam_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_hak_pakai" ADD CONSTRAINT "inventory_hak_pakai_petak_id_inventory_petak_id_fk" FOREIGN KEY ("petak_id") REFERENCES "public"."inventory_petak"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_hak_pakai" ADD CONSTRAINT "inventory_hak_pakai_kavling_id_inventory_kavling_id_fk" FOREIGN KEY ("kavling_id") REFERENCES "public"."inventory_kavling"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_pemegang_hak" ADD CONSTRAINT "inventory_pemegang_hak_hak_pakai_id_inventory_hak_pakai_id_fk" FOREIGN KEY ("hak_pakai_id") REFERENCES "public"."inventory_hak_pakai"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_pemakaman" ADD CONSTRAINT "inventory_pemakaman_petak_id_inventory_petak_id_fk" FOREIGN KEY ("petak_id") REFERENCES "public"."inventory_petak"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_pemakaman" ADD CONSTRAINT "inventory_pemakaman_hak_pakai_id_inventory_hak_pakai_id_fk" FOREIGN KEY ("hak_pakai_id") REFERENCES "public"."inventory_hak_pakai"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_petak_alias" ADD CONSTRAINT "inventory_petak_alias_petak_id_inventory_petak_id_fk" FOREIGN KEY ("petak_id") REFERENCES "public"."inventory_petak"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_hak_pakai_petak_idx" ON "inventory_hak_pakai" USING btree ("petak_id");--> statement-breakpoint
CREATE INDEX "inventory_hak_pakai_kavling_idx" ON "inventory_hak_pakai" USING btree ("kavling_id");--> statement-breakpoint
CREATE INDEX "inventory_pemegang_hak_hak_pakai_idx" ON "inventory_pemegang_hak" USING btree ("hak_pakai_id");--> statement-breakpoint
CREATE INDEX "inventory_pemakaman_petak_idx" ON "inventory_pemakaman" USING btree ("petak_id");--> statement-breakpoint
CREATE INDEX "inventory_petak_alias_lokasi_nomor_idx" ON "inventory_petak_alias" USING btree ("lokasi_id","nomor_makam_key");
