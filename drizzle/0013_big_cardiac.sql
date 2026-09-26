CREATE TABLE "inventory_blok" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lokasi_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"number_pattern" text NOT NULL,
	"rows" integer NOT NULL,
	"cols" integer NOT NULL,
	"default_jenis_makam_id" uuid NOT NULL,
	"photo_file_key" text,
	"created_at" timestamp with time zone NOT NULL,
	"created_by_account_id" text NOT NULL,
	CONSTRAINT "inventory_blok_size_check" CHECK ("inventory_blok"."rows" >= 1 and "inventory_blok"."cols" >= 1)
);
--> statement-breakpoint
CREATE TABLE "inventory_kavling" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blok_id" uuid NOT NULL,
	"lokasi_id" uuid NOT NULL,
	"nomor_kavling" text NOT NULL,
	"nomor_kavling_key" text NOT NULL,
	"jenis_makam_id" uuid NOT NULL,
	"first_used_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"created_by_account_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_petak" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blok_id" uuid NOT NULL,
	"lokasi_id" uuid NOT NULL,
	"row" integer NOT NULL,
	"col" integer NOT NULL,
	"kind" text NOT NULL,
	"nomor_makam" text,
	"nomor_makam_key" text,
	"jenis_makam_id" uuid,
	"kavling_id" uuid,
	"perlu_verifikasi" boolean DEFAULT false NOT NULL,
	"first_used_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "inventory_petak_kind_fields_check" CHECK (("inventory_petak"."kind" = 'petak' and "inventory_petak"."nomor_makam" is not null and "inventory_petak"."jenis_makam_id" is not null)
          or ("inventory_petak"."kind" != 'petak' and "inventory_petak"."nomor_makam" is null and "inventory_petak"."jenis_makam_id" is null and "inventory_petak"."kavling_id" is null))
);
--> statement-breakpoint
ALTER TABLE "inventory_kavling" ADD CONSTRAINT "inventory_kavling_blok_id_inventory_blok_id_fk" FOREIGN KEY ("blok_id") REFERENCES "public"."inventory_blok"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_petak" ADD CONSTRAINT "inventory_petak_blok_id_inventory_blok_id_fk" FOREIGN KEY ("blok_id") REFERENCES "public"."inventory_blok"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_petak" ADD CONSTRAINT "inventory_petak_kavling_id_inventory_kavling_id_fk" FOREIGN KEY ("kavling_id") REFERENCES "public"."inventory_kavling"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_blok_lokasi_name_idx" ON "inventory_blok" USING btree ("lokasi_id","name_key");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_kavling_lokasi_nomor_idx" ON "inventory_kavling" USING btree ("lokasi_id","nomor_kavling_key");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_petak_blok_position_idx" ON "inventory_petak" USING btree ("blok_id","row","col");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_petak_lokasi_nomor_idx" ON "inventory_petak" USING btree ("lokasi_id","nomor_makam_key");--> statement-breakpoint
CREATE INDEX "inventory_petak_kavling_idx" ON "inventory_petak" USING btree ("kavling_id");