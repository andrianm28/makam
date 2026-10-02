import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Billing } from "@/domain/billing";
import type { Fieldwork } from "@/domain/fieldwork";
import type { Identity } from "@/domain/identity";
import type { Layanan } from "@/domain/layanan";
import type { Lokasi } from "@/domain/lokasi";
import type { Notifications } from "@/domain/notifications";
import type { Refunds } from "@/domain/refunds";
import type { Tariffs } from "@/domain/tariffs";
import type { Clock } from "@/ports/clock";
import type { FileStore } from "@/ports/file-store";

/**
 * Who is placing a Pengurusan order: an Akun's id with the email the wizard's
 * form holds, which has to be that Akun's Email Terverifikasi. The wizard's
 * Kirim is the login itself (the one exception in AGENTS.md), so the Server
 * Action has no session cookie to read an Actor from; the Kode Masuk (or the
 * session, for a Pemesan already signed in) hands it these two facts instead,
 * and the module checks that the two really belong together.
 */
export interface Pemesan {
  accountId: string;
  email: string;
}

/**
 * What the Pengurusan module needs from its neighbours, and only their public
 * functions, never their tables: the TPU list and the new-plot flag from Lokasi
 * (which owns that data), the working-time calculator with it (the fixed TPU
 * window), every price from Tariffs' `quote()`, the Tagihan and the Nomor
 * Pemesanan series from Billing, which Akun an email belongs to and which staff
 * may be assigned from Identity, the private FileStore for the IPTM photo a
 * Tumpang carries, Field Work for the "Ambil surat pengantar" Tugas the
 * confirmation creates, the Audit Log for its own staff writes, and the family
 * message the confirmation sends.
 */
export interface PengurusanDeps {
  db: Database;
  clock: Clock;
  /** The private bucket, for the IPTM photo a Tumpang is placed with. */
  files: FileStore;
  /** Every staff write this module makes is recorded through it, in the same transaction. */
  audit: AuditLog;
  lokasi: Pick<Lokasi, "publicTpuDki" | "publicTpuDkiList">;
  tariffs: Pick<Tariffs, "quote">;
  /** For the Nomor Pemesanan series and the Tagihan, both taken `within` the order's own transaction. */
  billing: Pick<Billing, "within" | "tagihan" | "tagihanBerlaku" | "setOverdueAnchor" | "batalkanTagihan">;
  identity: Pick<Identity, "accountByEmail" | "staffAccounts">;
  /** The Tasks the confirmation creates, inside its own transaction so a rollback takes the task with it. */
  fieldwork: Pick<Fieldwork, "createTugasLapangan" | "within">;
  notifikasi: Pick<Notifications, "pengurusanDikonfirmasi" | "tagihanTerbit" | "iptmTerbit">;
  /**
   * A paid order cancelled before the IPTM is filed becomes a refund request (ticket 46): the full
   * amount before Dimakamkan, everything but the Biaya Pengurusan from then on. Refunds approves and
   * transfers it; this module only raises it, inside the cancellation's own transaction.
   */
  refunds: Pick<Refunds, "ajukanBaris">;
  /**
   * The hari-H Layanan a Saat Duka TPU order may add (story 23, ticket 56): priced at
   * the DKI price for the Tagihan the confirmation issues, and scheduled as Pekerjaan
   * Layanan inside that same transaction. Required: a missing wiring is a compile error,
   * never a runtime refusal of an order that named such items.
   */
  layanan: Pick<Layanan, "barisHariHTpu" | "jadwalkanHariHTpu">;
}
