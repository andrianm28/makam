/**
 * Audit Log: one Entri Audit per staff write (who, under which role, when, to
 * what, before/after, reason). Reads are never recorded.
 *
 * Owns table: audit_entry (append-only: the database refuses UPDATE and DELETE).
 *
 * A staff write goes through `staffWrite`, the only way to record an entry: it
 * runs the write and its entries in one transaction, and refuses to commit a
 * write that recorded none.
 */
import { and, asc, eq, notInArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { refusable } from "@/db/unit-of-work";
import type { Role } from "@/domain/identity";
import type { Clock } from "@/ports/clock";
import { auditEntry } from "./schema";

/** A JSON-serialisable snapshot of the entity before or after the write. */
export type AuditSnapshot = Record<string, unknown> | null;

export interface AuditEntity {
  /** e.g. "akun", "undangan_staf". */
  kind: string;
  id: string;
}

/** The role the actor wrote under: a role it holds, or an ops command run on the server (no one signed in). */
export type AuditActorRole = Role | "seed_cli" | "ops_cli";

/** Every staff write that is audited. Later tickets add theirs here. */
export type AuditAction =
  /** `seed:admin`: the first Admin Platform. */
  | "staf.seed_admin_platform"
  /** Admin Platform sends an Undangan Staf. */
  | "staf.undang"
  /** An accepted Undangan Staf grants its role to the Akun. */
  | "staf.peran_diberikan"
  /** Admin Platform deactivates an Akun Staf. */
  | "staf.nonaktifkan"
  /** Admin Platform removes an Admin Lokasi from one Lokasi Mitra. */
  | "staf.lepas_admin_lokasi"
  /** Pemulihan Akun: Admin Platform moves an Akun to a new Email Terverifikasi after a KTP check. */
  | "akun.pemulihan"
  /** An Akun Staf changes its own phone number (a contact). */
  | "akun.ubah_telepon"
  /** Admin Platform completes TOTP enrolment. */
  | "akun.totp_daftar"
  /** `reset-totp`: ops clears an Admin Platform's TOTP enrolment. */
  | "akun.totp_reset"
  /** An old app's catalog code is bound to the Lokasi Mitra or Jenis Makam the import created from it (ticket 86). */
  | "katalog_lama.impor"
  /** Admin Platform changes Pengaturan Operator. */
  | "pengaturan_operator.ubah"
  /** An Akun Staf turns push on for a Perangkat Push. */
  | "akun.push_aktifkan"
  /** An Akun Staf turns push off for a Perangkat Push. */
  | "akun.push_matikan"
  /** An Akun Staf verifies its email, the same one or a new one (Verifikasi Email; never the code). */
  | "akun.email_verifikasi"
  /** Admin Platform creates a Lokasi Mitra (Belum Tayang). */
  | "lokasi.buat"
  /** Admin Platform records a Lokasi Mitra's profile (name, pengelola, address, city, pin, facilities). */
  | "lokasi.ubah_profil"
  /** Admin Platform marks a Lokasi Mitra as example data, or clears the mark (ticket 86). */
  | "lokasi.tandai_data_contoh"
  /** Admin Platform edits a Lokasi Mitra's document checklist. */
  | "lokasi.ubah_dokumen"
  /** Admin Platform sets a Lokasi Mitra's policies and flags. */
  | "lokasi.ubah_kebijakan"
  /** Admin Platform sets or changes a Lokasi Mitra's bank account. */
  | "lokasi.ubah_rekening"
  /** Admin Platform uploads a Lokasi Mitra's agreement scan and signing date. */
  | "lokasi.unggah_perjanjian"
  /** Admin Platform enters a new version of a global tariff (Biaya Layanan Platform, Biaya Pengurusan, Retribusi Pemda). */
  | "tarif.ubah_global"
  /** Admin Platform defines a Jenis Makam of a Lokasi Mitra with its first tariff version. */
  | "tarif.buat_jenis_makam"
  /** Admin Platform enters a new tariff version of a Jenis Makam (Harga Hak Pakai, tenure, Perpanjangan price). */
  | "tarif.ubah_jenis_makam"
  /** Admin Platform enters a new version of a Lokasi Mitra's Biaya Pemakaman (+ tumpang amount). */
  | "tarif.ubah_biaya_pemakaman"
  /** Admin Platform marks a Lokasi Mitra's tariffs "diperiksa" (publish gate). */
  | "tarif.tandai_diperiksa"
  /** Admin Platform enters a new version of a Layanan variant's price at a Lokasi Mitra. */
  | "tarif.ubah_harga_layanan"
  /** Admin Platform enters a new version of a Layanan variant's DKI price. */
  | "tarif.ubah_harga_layanan_dki"
  /** Admin Platform enters a new version of a Mitra Jasa rate for a Layanan variant. */
  | "tarif.ubah_tarif_mitra_jasa"
  /** Admin Platform adds a Layanan to the catalog, with its first variants. */
  | "layanan.buat"
  /** Admin Platform changes a Layanan's own fields. */
  | "layanan.ubah"
  /** Admin Platform removes a Layanan from the catalog, with its variants. */
  | "layanan.hapus"
  /** Admin Platform adds a fixed-price variant to a Layanan. */
  | "layanan.tambah_varian"
  /** Admin Platform removes a variant from the catalog. */
  | "layanan.hapus_varian"
  /** Admin Platform marks a Layanan variant "boleh di TPU DKI" by hand, or takes the mark off. */
  | "layanan.tandai_tpu_dki"
  /** Admin Platform switches a Layanan variant on at a Lokasi Mitra. */
  | "layanan.tawarkan"
  /** Admin Platform stops a Lokasi Mitra offering a Layanan variant. */
  | "layanan.stop_tawarkan"
  /** Admin Platform defines a Paket Layanan. */
  | "paket_layanan.buat"
  /** Admin Platform changes a Paket Layanan. */
  | "paket_layanan.ubah"
  /** Admin Platform removes a Paket Layanan definition. */
  | "paket_layanan.hapus"
  /** An Admin Lokasi (or Admin Platform) sets a Lokasi Mitra's Jam Operasional: weekly hours and Tanggal Tutup. */
  | "lokasi.ubah_jam_operasional"
  /** An Admin Lokasi (or Admin Platform) picks a Lokasi Mitra's Kontak Siaga from its Admin Lokasi. */
  | "lokasi.pilih_kontak_siaga"
  /** Admin Platform adds a Hari Libur Nasional (the Admin Platform Hari Kerja calendar). */
  | "hari_libur.tambah"
  /** Admin Platform removes a Hari Libur Nasional (the Admin Platform Hari Kerja calendar). */
  | "hari_libur.hapus"
  /** Admin Platform adds a DKI TPU to the list (name, address, pin, data source, the initial new-plot flag). */
  | "tpu.buat"
  /** Admin Platform corrects a DKI TPU's name, address, pin or data source. */
  | "tpu.ubah"
  /** Admin Platform edits a DKI TPU's "menerima makam baru" flag, which stamps the date it was checked. */
  | "tpu.ubah_flag"
  /** A Catatan Internal is written (tickets 17, 23): never in the Admin Lokasi view. */
  | "catatan_internal.tulis"
  /** Admin Platform takes (Ambil) an Antrean row (ticket 17): never in the Admin Lokasi view. */
  | "antrean.ambil"
  /** Admin Platform releases its Ambil claim on a row when it goes off Bertugas (ticket 28): never in the Admin Lokasi view. */
  | "antrean.lepas"
  /** Admin Platform switches Bertugas on (ticket 28). */
  | "bertugas.aktifkan"
  /** Admin Platform switches Bertugas off by hand (ticket 28); the automatic switch-off is no staff write and is recorded on the Bertugas stretch itself. */
  | "bertugas.matikan"
  /** Admin Platform logs the "Telepon Pemesan" call, closing its row (ticket 20): never in the Admin Lokasi view. */
  | "telepon_pemesan.catat_panggilan"
  /** An Admin Lokasi creates a Blok on its Denah (size, numbering pattern, initial Jenis Makam). */
  | "denah.buat_blok"
  /** An Admin Lokasi turns selected Denah cells into Petak Makam, Jalan, Bukan Petak or Pintu Masuk. */
  | "denah.ubah_jenis_sel"
  /** An Admin Lokasi sets the Jenis Makam of selected Petak Makam. */
  | "denah.atur_jenis_makam"
  /** An Admin Lokasi changes a Petak Makam's Nomor Makam, one cell or a bulk renumber. */
  | "denah.ubah_nomor"
  /** An Admin Lokasi groups adjacent Petak Makam into a Kavling Keluarga. */
  | "denah.buat_kavling"
  /** An Admin Lokasi splits a Kavling Keluarga back into separate Petak Makam. */
  | "denah.pisahkan_kavling"
  /** An Admin Lokasi adds or removes a row or column of a Blok's grid. */
  | "denah.ubah_baris_kolom"
  /** An Admin Lokasi removes a Blok that is empty of history (never used, never held), with a reason. */
  | "denah.hapus_blok"
  /** An Admin Lokasi uploads or replaces a Blok's site-plan photo. */
  | "denah.unggah_foto_blok"
  /** An Admin Lokasi clears a newly drawn Petak or Kavling Keluarga: Tersedia, Tidak Tersedia (with a reason) or occupied (a minimal Hak Pakai, its Pemegang Hak and, when known, its first Pemakaman). */
  | "denah.bersihkan_petak"
  /** Admin Platform renumbers a Petak Makam, the old Nomor Makam kept as a hidden alias. */
  | "petak.nomor_ulang"
  /** An Admin Lokasi assigns a cleared Tersedia Petak to a confirmed order: the Hak Pakai Aktif it creates (ticket 23). */
  | "denah.pakai_petak"
  /** Admin Platform creates and assigns a Tugas Lapangan to one Petugas Lapangan. */
  | "tugas_lapangan.buat"
  /** A Petugas Lapangan marks a Tugas Lapangan Selesai (its required uploads and type-specific form). */
  | "tugas_lapangan.selesai"
  /** A completed Kunjungan Verifikasi updates a Lokasi's pin, facilities, photos and "dikunjungi" date. */
  | "lokasi.catat_kunjungan_verifikasi"
  /** A completed Cek Denah is recorded on a Lokasi (ticket 16's Terencana-switch input). */
  | "lokasi.catat_cek_denah"
  /** Admin Platform publishes a Lokasi Mitra (Belum Tayang → Terverifikasi) once the publish gate is met. */
  | "lokasi.terbitkan"
  /** Admin Platform switches a Lokasi Mitra's "Pemesanan Terencana aktif" on. */
  | "lokasi.aktifkan_terencana"
  /** Admin Platform records that a Lokasi Mitra still meets the publish gate, after a revisit (ticket 17). */
  | "lokasi.konfirmasi_syarat_tayang"
  /** An Admin Lokasi confirms a Saat Duka order: the Petak it assigned, the Hak Pakai and the Tagihan issued with it (ticket 23). */
  | "pemesanan.konfirmasi_saat_duka"
  /** An Admin Lokasi confirms a Pemesanan Terencana: the payment hold that starts and the pay-first Tagihan issued with it (ticket 37). */
  | "pemesanan.konfirmasi_terencana"
  /** An Admin Lokasi declines a Pemesanan Terencana with a reason from the fixed list, and its plots are released (ticket 37). */
  | "pemesanan.tolak_terencana"
  /** An Admin Lokasi ticks a document off one of its orders' checklists (ticket 23). */
  | "pemesanan.centang_dokumen"
  /** An Admin Lokasi confirms there is no Pemakaman and approves a Pembatalan of a paid Terencana order: the Hak Pakai is Dibatalkan and the refund asked (ticket 38). */
  | "pembatalan_terencana.setujui"
  /** An Admin Lokasi declines a Pembatalan of a paid Terencana order, with a reason (ticket 38). */
  | "pembatalan_terencana.tolak"
  /** An Admin Lokasi sends a Pembatalan request back for a fix (ticket 38). */
  | "pembatalan_terencana.minta_perbaikan"
  /** Admin Platform holds a Pencairan item out of the runs with a reason, or puts it back (ticket 32). */
  | "pencairan.tahan"
  /** Admin Platform overrides what a Pencairan item pays after a Keluhan, with a note (ticket 32). */
  | "pencairan.override_jumlah"
  /** Admin Platform issues a Bukti Pencairan for a transfer, with its items and Potongan (ticket 32). */
  | "pencairan.terbitkan_bukti"
  /** Admin Platform records a Potongan a Lokasi Mitra owes (ticket 32). */
  | "pencairan.catat_potongan"
  /** Admin Platform records that a Potongan was paid outside a Pencairan run (ticket 32). */
  | "pencairan.catat_potongan_lunas"
  /** An Admin Lokasi declines one of its Saat Duka orders, with a reason from the fixed list (ticket 24). */
  | "pemesanan.tolak"
  /** An Admin Lokasi offers a Saat Duka order an alternative, another Jenis Makam or day (ticket 24). */
  | "pemesanan.tawarkan_alternatif"
  /** An Admin Lokasi records a cancellation on a family's behalf (ticket 24). */
  | "pemesanan.batalkan_untuk_pemesan"
  /** Admin Platform confirms a Saat Duka TPU order: the agreed burial, the Tagihan issued and the Ambil surat pengantar Tugas (ticket 45). */
  | "pengurusan.konfirmasi_saat_duka_tpu"
  /** Admin Platform offers the family another TPU for a Saat Duka order (ticket 45). */
  | "pengurusan.tawarkan_tpu_lain"
  /** Admin Platform records the burial of a Saat Duka TPU order, which starts the Tagihan's overdue clock and the 7-day filing window (ticket 46). */
  | "pengurusan.catat_dimakamkan"
  /** Admin Platform has checked the filing documents (ticket 46). */
  | "pengurusan.dokumen_lengkap"
  /** Admin Platform filed the IPTM on JakEVO (ticket 46). */
  | "pengurusan.iptm_diajukan"
  /** Admin Platform uploaded the IPTM scan and expiry; the Makam TPU was created or updated (ticket 46). */
  | "pengurusan.iptm_terbit"
  /** A payment to the Pemda is recorded on a Retribusi Pemda line: by an Admin Platform, or by the Petugas Lapangan who paid it in person (ticket 45). */
  | "setor_retribusi.catat"
  /** An Admin Lokasi records a Pemakaman on one of its Lokasi Mitra's plots, starting the Hak Pakai's tenure clock (ticket 25). */
  | "pemakaman.catat"
  /** An Admin Lokasi records the burial of one of its orders, which makes that order Dimakamkan (ticket 25). */
  | "pemesanan.catat_pemakaman"
  /** Admin Platform marks a Tagihan paid by hand (Transfer manual / Tunai), with proof (ticket 30). */
  | "tagihan.catat_pembayaran_manual"
  /** The Tagihan's own Admin Lokasi records "Dibayar langsung ke Lokasi Mitra", with proof (ticket 30). */
  | "tagihan.catat_pembayaran_langsung"
  /** Admin Platform reverses a "Dibayar langsung ke Lokasi Mitra" record (ticket 30). */
  | "tagihan.batalkan_pembayaran_langsung"
  /** Admin Platform sets a Harga Khusus on an order: cancels and reissues its Tagihan with a negative line (ticket 30). */
  | "tagihan.tetapkan_harga_khusus"
  /** Admin Platform raises a goodwill refund on a Tagihan, from the Operator's own funds (ticket 31). */
  | "pengembalian.ajukan_goodwill"
  /** Admin Platform approves a refund request: the Tier 3 "refund transfer" row appears (ticket 31). */
  | "pengembalian.setujui"
  /** The refund's destination bank account is recorded by Admin Platform on the Pemesan's behalf (ticket 31). */
  | "pengembalian.isi_rekening"
  /** The Pemesan enters the refund's destination bank account on their own order; the number is masked in the entry (ticket 31). */
  | "pengembalian.isi_rekening_pemesan"
  /** Admin Platform transfers a refund by hand, uploads the proof and enters the date: one Bukti Pengembalian Dana (ticket 31). */
  | "pengembalian.terbitkan_bukti"
  /** The Admin Lokasi ends a Hak Pakai once its Saat Duka Tagihan is Tidak Tertagih (spec, Billing > Chasing; ticket 29). */
  | "hak_pakai.akhiri_tidak_tertagih"
  /** The Admin Lokasi completes a Perlu Verifikasi Hak Pakai (end date, holder contact) before its Perpanjangan (ticket 40). */
  | "hak_pakai.lengkapi"
  /** Admin Platform declares a chased Tagihan Tidak Tertagih (spec, Billing > Chasing; ticket 29). */
  | "tagihan.tidak_tertagih"
  /** A staff member adds a standalone note to a chased Tagihan's call log (ticket 29). */
  | "tagihan.catatan_ditambah"
  /** Admin Platform starts a Mitra Jasa's onboarding record and invites them to an email (ticket 55). */
  | "mitra_jasa.buat"
  /** Admin Platform records a Mitra Jasa's profile: name, NIK, home area, emergency contact, coverage. */
  | "mitra_jasa.ubah_profil"
  /** Admin Platform sets a Mitra Jasa's bank account, with the override note its name rule needs. */
  | "mitra_jasa.ubah_rekening"
  /** Admin Platform uploads a Mitra Jasa's KTP photo or the signed arrangement scan. */
  | "mitra_jasa.unggah_berkas"
  /** Admin Platform sets a Mitra Jasa Aktif, Ditangguhkan or Berhenti, with the reason. */
  | "mitra_jasa.ubah_status"
  /** A Mitra Jasa sets or takes off one of their own "Tidak tersedia" ranges. */
  | "mitra_jasa.atur_tidak_tersedia"
  /** Admin Platform records the monthly scorecard review. */
  | "mitra_jasa.catat_tinjauan"
  /**
   * The Admin Lokasi of a Lokasi Mitra completes one Hak Pakai flagged Perlu
   * Verifikasi — the flag the first Perpanjangan or Layanan on that Hak Pakai waits
   * for, and the exit a gate with no exit could not be opened through (ticket 50).
   */
  | "hak_pakai.selesaikan_verifikasi"
  /** The Admin Lokasi starts a Pekerjaan Layanan at its Lokasi Mitra: Sedang Dikerjakan (ticket 50). */
  | "layanan.mulai_pekerjaan"
  /** The Admin Lokasi captures (or re-captures) one proof of a Pekerjaan Layanan in the app (ticket 50). */
  | "layanan.unggah_bukti"
  /** The Admin Lokasi marks a Pekerjaan Layanan Selesai once every proof its Layanan requires is there (ticket 50). */
  | "layanan.selesaikan_pekerjaan"
  /** Admin Platform hands a TPU job to one Mitra Jasa through the hard-filtered picker (ticket 56). */
  | "layanan.tugaskan_pekerjaan_tpu"
  /** A Mitra Jasa accepts or declines the TPU job assigned to them (ticket 56). */
  | "layanan.jawab_penugasan_tpu"
  /** Admin Platform takes a TPU job off the Mitra Jasa who holds it, so it can be given to another (ticket 56). */
  | "layanan.lepas_penugasan_tpu"
  /** An Admin Lokasi approves a manual Perpanjangan request (KTP, heir or claim); the approval stays valid 30 days (ticket 41). */
  | "perpanjangan.setujui"
  /** An Admin Lokasi rejects a manual Perpanjangan request, with a reason (ticket 41). */
  | "perpanjangan.tolak"
  /** An Admin Lokasi sends a manual Perpanjangan request back for correction, with the reason (ticket 41). */
  | "perpanjangan.minta_perbaikan"
  /** An Admin Lokasi records a new Pemegang Hak on a Hak Pakai; the earlier holder is kept in the history (ticket 41). */
  | "hak_pakai.ganti_pemegang"
  /** An Admin Lokasi changes the recorded phone number and email of a Pemegang Hak after a KTP check (ticket 41). */
  | "hak_pakai.ubah_kontak_pemegang"
  /** Admin Platform decides a Keluhan on a Pekerjaan Layanan: rejected, a redo, or a refund (ticket 51). */
  | "layanan.putuskan_keluhan";

/**
 * What the Admin Lokasi view of a Lokasi's Audit Log leaves out (spec, Audit
 * Log): Catatan Internal and Antrean claims.
 */
const HIDDEN_FROM_ADMIN_LOKASI: readonly AuditAction[] = ["catatan_internal.tulis", "antrean.ambil", "antrean.lepas"];

export interface NewAuditEntry {
  /** The Akun that did the write, and the role it acted under. */
  actor: { accountId: string; role: AuditActorRole };
  action: AuditAction;
  entity: AuditEntity;
  /**
   * The Lokasi Mitra the write belongs to, if any: set it on every write about
   * a Lokasi (its record, tariffs, status, its Admin Lokasi, its orders), so
   * the Lokasi's Admin Lokasi see it in `entriesForLokasi`.
   */
  lokasiId?: string | null;
  before: AuditSnapshot;
  after: AuditSnapshot;
  reason: string | null;
}

export interface AuditEntry extends NewAuditEntry {
  id: string;
  at: Date;
  lokasiId: string | null;
}

/** Records one Entri Audit in the staff write's transaction, stamped with the Clock. */
export type RecordEntry = (entry: NewAuditEntry) => Promise<void>;

/** Thrown when a staff write tries to commit without an Entri Audit: nothing is kept. */
export class UnauditedStaffWrite extends Error {
  constructor() {
    super("A staff write must record an Entri Audit before it commits");
    this.name = "UnauditedStaffWrite";
  }
}

export interface AuditLog {
  /**
   * Runs one staff write in a transaction on `db`, with `record` for its Entri
   * Audit. A result `{ ok: false }` is a refusal: everything is rolled back and
   * the result returned. A result `{ ok: true }` commits only if at least one
   * entry was recorded; otherwise nothing is kept and `UnauditedStaffWrite` is thrown.
   */
  staffWrite<T extends { ok: boolean }>(db: Database, write: (tx: Database, record: RecordEntry) => Promise<T>): Promise<T>;
  /** Every Entri Audit about one entity, oldest first. */
  entriesAbout(entity: AuditEntity): Promise<AuditEntry[]>;
  /** The whole Audit Log, oldest first (Admin Platform's `audit.lihat`). */
  allEntries(): Promise<AuditEntry[]>;
  /**
   * The Audit Log of one Lokasi Mitra as its Admin Lokasi see it, oldest
   * first: every entry about that Lokasi except Catatan Internal and Antrean claims.
   */
  entriesForLokasi(lokasiId: string): Promise<AuditEntry[]>;
  /** Every entry about one Lokasi Mitra, oldest first, nothing hidden (Admin Platform's view). */
  allEntriesForLokasi(lokasiId: string): Promise<AuditEntry[]>;
}

export function createAuditLog(deps: { db: Database; clock: Clock }): AuditLog {
  return {
    staffWrite(db, write) {
      return refusable(db, async (tx) => {
        let recorded = 0;
        const record: RecordEntry = async (entry) => {
          await tx.insert(auditEntry).values({
            at: deps.clock.now(),
            actorAccountId: entry.actor.accountId,
            actorRole: entry.actor.role,
            action: entry.action,
            entityKind: entry.entity.kind,
            entityId: entry.entity.id,
            lokasiId: entry.lokasiId ?? null,
            before: entry.before,
            after: entry.after,
            reason: entry.reason,
          });
          recorded++;
        };
        const result = await write(tx, record);
        if (result.ok && recorded === 0) throw new UnauditedStaffWrite();
        return result;
      });
    },
    async entriesAbout(entity) {
      const rows = await deps.db
        .select()
        .from(auditEntry)
        .where(and(eq(auditEntry.entityKind, entity.kind), eq(auditEntry.entityId, entity.id)))
        .orderBy(asc(auditEntry.at), asc(auditEntry.seq));
      return rows.map(toEntry);
    },
    async allEntries() {
      const rows = await deps.db.select().from(auditEntry).orderBy(asc(auditEntry.at), asc(auditEntry.seq));
      return rows.map(toEntry);
    },
    async entriesForLokasi(lokasiId) {
      const rows = await deps.db
        .select()
        .from(auditEntry)
        .where(and(eq(auditEntry.lokasiId, lokasiId), notInArray(auditEntry.action, [...HIDDEN_FROM_ADMIN_LOKASI])))
        .orderBy(asc(auditEntry.at), asc(auditEntry.seq));
      return rows.map(toEntry);
    },
    async allEntriesForLokasi(lokasiId) {
      const rows = await deps.db
        .select()
        .from(auditEntry)
        .where(eq(auditEntry.lokasiId, lokasiId))
        .orderBy(asc(auditEntry.at), asc(auditEntry.seq));
      return rows.map(toEntry);
    },
  };
}

function toEntry(row: typeof auditEntry.$inferSelect): AuditEntry {
  return {
    id: row.id,
    at: row.at,
    actor: { accountId: row.actorAccountId, role: row.actorRole as AuditActorRole },
    action: row.action as AuditAction,
    entity: { kind: row.entityKind, id: row.entityId },
    lokasiId: row.lokasiId,
    before: (row.before as AuditSnapshot) ?? null,
    after: (row.after as AuditSnapshot) ?? null,
    reason: row.reason,
  };
}
