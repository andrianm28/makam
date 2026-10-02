CREATE TABLE "perpanjangan_pengingat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hak_pakai_id" text NOT NULL,
	"end_date" date NOT NULL,
	"tahap" text NOT NULL,
	"dicatat_pada" timestamp with time zone NOT NULL,
	CONSTRAINT "perpanjangan_pengingat_unik" UNIQUE("hak_pakai_id","end_date","tahap")
);
--> statement-breakpoint
ALTER TABLE "inventory_hak_pakai" ADD COLUMN "pembongkaran_at" timestamp with time zone;