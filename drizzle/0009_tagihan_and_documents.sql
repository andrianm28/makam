CREATE TABLE "bukti_pembayaran" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nomor" text NOT NULL,
	"link" text NOT NULL,
	"tagihan_id" uuid NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"amount" bigint NOT NULL,
	"method" jsonb NOT NULL,
	"reference" text,
	"header" jsonb NOT NULL,
	CONSTRAINT "bukti_pembayaran_nomor_unique" UNIQUE("nomor"),
	CONSTRAINT "bukti_pembayaran_link_unique" UNIQUE("link")
);
--> statement-breakpoint
CREATE TABLE "billing_document_counter" (
	"series" text NOT NULL,
	"year" integer NOT NULL,
	"last_number" integer NOT NULL,
	CONSTRAINT "billing_document_counter_series_year_pk" PRIMARY KEY("series","year")
);
--> statement-breakpoint
CREATE TABLE "tagihan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nomor" text NOT NULL,
	"link" text NOT NULL,
	"kind" text NOT NULL,
	"moment" jsonb NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"addressee_role" text NOT NULL,
	"addressee_name" text NOT NULL,
	"addressee_phone" text NOT NULL,
	"addressee_account_id" text,
	"nomor_pemesanan" text,
	"place_name" text,
	"line_count" integer NOT NULL,
	"total" bigint NOT NULL,
	"header" jsonb NOT NULL,
	"replaces_id" uuid,
	"status" text NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_reason" text,
	"replaced_by_id" uuid,
	"paid_at" timestamp with time zone,
	CONSTRAINT "tagihan_nomor_unique" UNIQUE("nomor"),
	CONSTRAINT "tagihan_link_unique" UNIQUE("link"),
	CONSTRAINT "tagihan_total_check" CHECK ("tagihan"."total" between 0 and 100000000000)
);
--> statement-breakpoint
CREATE TABLE "tagihan_line" (
	"tagihan_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"amount" bigint NOT NULL,
	"provider" jsonb NOT NULL,
	"layanan_target_date" date,
	"layanan_lead_time_days" integer,
	CONSTRAINT "tagihan_line_tagihan_id_position_pk" PRIMARY KEY("tagihan_id","position"),
	CONSTRAINT "tagihan_line_amount_check" CHECK ("tagihan_line"."amount" between -100000000000 and 100000000000)
);
--> statement-breakpoint
ALTER TABLE "bukti_pembayaran" ADD CONSTRAINT "bukti_pembayaran_tagihan_id_tagihan_id_fk" FOREIGN KEY ("tagihan_id") REFERENCES "public"."tagihan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tagihan_line" ADD CONSTRAINT "tagihan_line_tagihan_id_tagihan_id_fk" FOREIGN KEY ("tagihan_id") REFERENCES "public"."tagihan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tagihan_lapse_idx" ON "tagihan" USING btree ("status","kind","due_at");--> statement-breakpoint
CREATE FUNCTION "tagihan_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'an issued Tagihan is never deleted, only cancelled' USING ERRCODE = 'insufficient_privilege';
	END IF;
	IF (NEW."id", NEW."nomor", NEW."link", NEW."kind", NEW."moment", NEW."issued_at", NEW."due_at", NEW."addressee_role",
		NEW."addressee_name", NEW."addressee_phone", NEW."addressee_account_id", NEW."nomor_pemesanan", NEW."place_name",
		NEW."line_count", NEW."total", NEW."header", NEW."replaces_id")
		IS DISTINCT FROM
		(OLD."id", OLD."nomor", OLD."link", OLD."kind", OLD."moment", OLD."issued_at", OLD."due_at", OLD."addressee_role",
		OLD."addressee_name", OLD."addressee_phone", OLD."addressee_account_id", OLD."nomor_pemesanan", OLD."place_name",
		OLD."line_count", OLD."total", OLD."header", OLD."replaces_id") THEN
		RAISE EXCEPTION 'an issued Tagihan is immutable: cancel it and issue a new one' USING ERRCODE = 'insufficient_privilege';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "tagihan_no_change_once_issued" BEFORE UPDATE OR DELETE ON "tagihan" FOR EACH ROW EXECUTE FUNCTION "tagihan_immutable"();--> statement-breakpoint
CREATE FUNCTION "tagihan_line_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'INSERT' THEN
		IF (SELECT count(*) FROM "tagihan_line" WHERE "tagihan_id" = NEW."tagihan_id")
			>= (SELECT "line_count" FROM "tagihan" WHERE "id" = NEW."tagihan_id") THEN
			RAISE EXCEPTION 'an issued Tagihan''s lines are immutable: cancel it and issue a new one' USING ERRCODE = 'insufficient_privilege';
		END IF;
		RETURN NEW;
	END IF;
	RAISE EXCEPTION 'an issued Tagihan''s lines are immutable: % is not allowed', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "tagihan_line_no_change_once_issued" BEFORE INSERT OR UPDATE OR DELETE ON "tagihan_line" FOR EACH ROW EXECUTE FUNCTION "tagihan_line_immutable"();--> statement-breakpoint
CREATE FUNCTION "bukti_pembayaran_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'bukti_pembayaran is append-only: % is not allowed', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "bukti_pembayaran_no_update_or_delete" BEFORE UPDATE OR DELETE ON "bukti_pembayaran" FOR EACH ROW EXECUTE FUNCTION "bukti_pembayaran_append_only"();
