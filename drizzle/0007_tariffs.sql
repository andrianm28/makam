CREATE TABLE "tariff_global_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"effective_on" date NOT NULL,
	"in_force_from" timestamp with time zone NOT NULL,
	"entered_at" timestamp with time zone NOT NULL,
	"entered_by_account_id" text NOT NULL,
	"key" text NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "tariff_global_version_amount_check" CHECK ("tariff_global_version"."amount" >= 0)
);
--> statement-breakpoint
CREATE INDEX "tariff_global_version_key_idx" ON "tariff_global_version" USING btree ("key","in_force_from","seq");--> statement-breakpoint
CREATE FUNCTION "tariff_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "tariff_global_version_no_update_or_delete" BEFORE UPDATE OR DELETE ON "tariff_global_version" FOR EACH ROW EXECUTE FUNCTION "tariff_append_only"();