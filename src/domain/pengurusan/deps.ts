import type { Database } from "@/db/client";
import type { Billing } from "@/domain/billing";
import type { Identity } from "@/domain/identity";
import type { Lokasi } from "@/domain/lokasi";
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
 * window), every price from Tariffs' `quote()`, the Nomor Pemesanan series from
 * Billing, which Akun an email belongs to from Identity, and the private
 * FileStore for the IPTM photo a Tumpang carries.
 */
export interface PengurusanDeps {
  db: Database;
  clock: Clock;
  /** The private bucket, for the IPTM photo a Tumpang is placed with. */
  files: FileStore;
  lokasi: Pick<Lokasi, "publicTpuDki" | "publicTpuDkiList">;
  tariffs: Pick<Tariffs, "quote">;
  /** For the Nomor Pemesanan series, taken `within` the order's own transaction. */
  billing: Pick<Billing, "within">;
  identity: Pick<Identity, "accountByEmail">;
}
