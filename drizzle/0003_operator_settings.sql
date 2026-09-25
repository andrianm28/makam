CREATE TABLE "operator_settings_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"in_force_from" timestamp with time zone NOT NULL,
	"legal_name" text NOT NULL,
	"address" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"cs_whatsapp" text NOT NULL,
	"cs_reply_hours" text NOT NULL,
	"changed_by_account_id" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "operator_settings_version_in_force_idx" ON "operator_settings_version" USING btree ("in_force_from","seq");--> statement-breakpoint
CREATE FUNCTION "operator_settings_version_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'operator_settings_version is append-only: % is not allowed', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "operator_settings_version_no_update_or_delete" BEFORE UPDATE OR DELETE ON "operator_settings_version" FOR EACH ROW EXECUTE FUNCTION "operator_settings_version_append_only"();