-- Email is the Akun (ADR 0004). Generated with drizzle-kit, then edited by hand
-- (comments and the data steps at the end). The Akun is keyed by its Email
-- Terverifikasi (identity_user.email with email_verified_at set, unique on
-- lower(email) since 0005); the phone number becomes an unverified contact.
--
-- Effect on existing rows:
-- - An Akun with an Email Terverifikasi keeps its id, roles, orders, sessions
--   and Entri Audit, and logs in with a Kode Masuk to that email.
-- - An Akun without one (only a WhatsApp number, or an email that was only
--   typed in) keeps every row, but its sessions end here and it cannot log in
--   until an Admin Platform does a Pemulihan Akun. No email is invented or
--   marked verified by this migration.
-- - Phone numbers stay as they are, now as contacts: no longer unique.
-- - WhatsApp Kode Masuk rows are deleted (codes live 10 minutes; their lock
--   keys name numbers that no longer log in).
-- - Open Undangan Staf stay open and are now accepted by the Akun whose Email
--   Terverifikasi is the invite's email.
--
-- Left for a later contract step, once no release reads them:
-- identity_user.phone_number_verified, identity_otp_request.channel.
-- contract: a phone number is an unverified contact (ADR 0004), so two Akun may give the same one; the running release only reads by it and works without the constraint
ALTER TABLE "identity_user" DROP CONSTRAINT "identity_user_phone_number_unique";--> statement-breakpoint
-- contract: Undangan Staf are looked up by email since ADR 0004; the running release only loses an index, not a column
DROP INDEX "identity_staff_invite_phone_idx";--> statement-breakpoint
CREATE INDEX "identity_staff_invite_email_idx" ON "identity_staff_invite" USING btree ("email","expires_at");--> statement-breakpoint
DELETE FROM "identity_otp_request" WHERE "channel" = 'whatsapp';--> statement-breakpoint
DELETE FROM "identity_session" WHERE "user_id" IN (
	SELECT "id" FROM "identity_user" WHERE "email" IS NULL OR "email_verified_at" IS NULL
);
