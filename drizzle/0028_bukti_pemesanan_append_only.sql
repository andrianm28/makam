CREATE FUNCTION "bukti_pemesanan_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'bukti_pemesanan is append-only: % is not allowed', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "bukti_pemesanan_no_update_or_delete" BEFORE UPDATE OR DELETE ON "bukti_pemesanan" FOR EACH ROW EXECUTE FUNCTION "bukti_pemesanan_append_only"();
