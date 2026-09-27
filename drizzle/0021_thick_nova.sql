CREATE TABLE "tpu_dki" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"pin_lat" double precision,
	"pin_lng" double precision,
	"data_source" text NOT NULL,
	"menerima_makam_baru" boolean NOT NULL,
	"flag_updated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tpu_dki_name_key_idx" ON "tpu_dki" USING btree ("name_key");--> statement-breakpoint
CREATE INDEX "tpu_dki_name_idx" ON "tpu_dki" USING btree ("name");