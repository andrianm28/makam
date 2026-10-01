/**
 * A further burial under an existing Hak Pakai — "Makamkan di sini" (spec,
 * Pemesanan > Burial under an existing Hak Pakai; stories 52–56, 122, 123).
 * It runs the Saat Duka track (Diajukan → Dikonfirmasi → Dimakamkan → Selesai,
 * plus Ditolak / Dibatalkan) **without creating a Hak Pakai**: the burial is
 * added to the right that already exists, and a tumpang never resets its tenure
 * clock.
 *
 * The Pemegang Hak must consent, and the consent resolves in order: implicit
 * when the logged-in Akun's Email Terverifikasi is the holder's recorded email;
 * else an emailed Setujui / Tolak request after a code sent to that address;
 * else verbal consent logged by the Admin Lokasi, or heirship proof brought on
 * the day. Only an implicit or settled consent lets the Admin Lokasi confirm.
 *
 * The code that proves the holder's email is stored only as a salted scrypt
 * hash, never in the clear; `ajukanTumpang` returns the freshly generated code
 * once so the boundary (the Server Action) can put it in the email, exactly as
 * the Kode Masuk hand-off works. The 10-minute life and the 5-wrong-codes rule
 * mirror the identity module's own codes.
 */
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { normaliseEmail, writeRefusal, lokasiMitraResource, type Actor, type WriteRefusal } from "@/domain/identity";
import { periksaBolehTumpang } from "@/domain/inventory";
import { wib, wibDateOf } from "@/lib/time/jakarta";
import { foldKey } from "@/lib/fold-key";
import { linesOf } from "./konfirmasi-saat-duka";
import type { NewTagihanLine, Tagihan } from "@/domain/billing";
import type { PemesananDeps } from "./deps";
import { pemesananMakam, pemesananTerencana, pemesananTerencanaUnit, tumpangJenisKeys } from "./schema";

/** How long a consent code lives, and how many wrong ones burn it (the Kode Masuk's own rules). */
export const KONSEN_KODE_EXPIRES_MS = 10 * 60_000;
export const KONSEN_KODE_MAX_SALAH = 5;

/** The tumpang request "Data & kirim" sends: only the Almarhum and the Pemesan, plus the grave's own address. */
export const ajukanTumpangSchema = z.object({
  pemesanAccountId: z.string().trim().min(1),
  pemesanEmail: z.string().trim().min(1).max(320),
  pemesanName: z.string().trim().min(1).max(200),
  phoneNumber: z.string().trim().max(30).optional(),
  lokasiId: z.uuid(),
  hakPakaiId: z.uuid(),
  /** Which of the three requests it is; a tumpang waits out the policy, an unused plot does not. */
  jenis: z.enum(tumpangJenisKeys),
  almarhumName: z.string().trim().min(1).max(200),
  tanggalWafat: z.iso.date(),
  /** The burial the family plans, as `datetime-local` holds it ("YYYY-MM-DDTHH:mm" in WIB); empty when none. */
  rencanaPemakamanAt: z.string().trim().max(40).optional(),
  keinginanPenempatan: z.string().trim().max(1000).optional(),
});
export type AjukanTumpangInput = z.infer<typeof ajukanTumpangSchema>;

export type AjukanTumpangResult =
  | {
      ok: true;
      pesanan: { id: string; nomor: string; status: "diajukan" };
      konsen: { state: "implisit" | "menunggu_email" | "menunggu_lokasi"; email: string | null };
      /**
       * The one-time code the boundary must email to the holder, returned only
       * when the state is `menunggu_email`; null otherwise. Never stored in the
       * clear.
       */
      kode: string | null;
    }
  | { ok: false; reason: "input_tidak_valid" }
  | { ok: false; reason: "email_bukan_akun_ini" }
  | { ok: false; reason: "hak_pakai_tidak_ditemukan" }
  /** The Hak Pakai at another Lokasi Mitra than the one the request names. */
  | { ok: false; reason: "lokasi_beda" }
  /** A Kavling Keluarga's next plot needs a target Petak chosen; the read offers them. */
  | { ok: false; reason: "petak_tidak_ditemukan" }
  | { ok: false; reason: "kavling_belum_didukung" }
  | { ok: false; reason: "pemesan_kosong" | "almarhum_kosong" | "pemegang_hak_almarhum" }
  | { ok: false; reason: "lokasi_tidak_terbuka" };

/**
 * Places one further-burial order: Diajukan against an existing Hak Pakai, its
 * consent resolved as far as it can go without the holder, and no money (the
 * pay-after Tagihan is issued when the Lokasi confirms). The order records the
 * Hak Pakai and Petak at submission because they are already known — this is
 * not a new plot to assign.
 */
export async function ajukanTumpang(deps: PemesananDeps, rawInput: unknown): Promise<AjukanTumpangResult> {
  const parsed = ajukanTumpangSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;

  const pemesanName = input.pemesanName.trim();
  if (pemesanName === "") return { ok: false, reason: "pemesan_kosong" };
  const almarhumName = input.almarhumName.trim();
  if (almarhumName === "") return { ok: false, reason: "almarhum_kosong" };
  if (foldKey(pemesanName) === foldKey(almarhumName)) return { ok: false, reason: "pemegang_hak_almarhum" };

  const akun = await deps.identity.accountByEmail(input.pemesanEmail);
  if (!akun || akun.id !== input.pemesanAccountId) return { ok: false, reason: "email_bukan_akun_ini" };

  const hakPakai = await deps.inventory.hakPakaiUntukTumpang(input.hakPakaiId);
  if (!hakPakai) return { ok: false, reason: "hak_pakai_tidak_ditemukan" };
  if (hakPakai.lokasiId !== input.lokasiId) return { ok: false, reason: "lokasi_beda" };
  if (!hakPakai.petak) return { ok: false, reason: hakPakai.kavling ? "kavling_belum_didukung" : "petak_tidak_ditemukan" };

  const lokasi = await deps.lokasi.publicLokasiMitra(input.lokasiId);
  if (!lokasi) return { ok: false, reason: "lokasi_tidak_terbuka" };

  const now = deps.clock.now();
  const holderEmail = hakPakai.pemegangHak?.email ? normaliseEmail(hakPakai.pemegangHak.email) : null;
  const pemesanEmail = normaliseEmail(input.pemesanEmail)!;
  const implicit = holderEmail !== null && holderEmail === pemesanEmail;
  const kode = implicit || holderEmail === null ? null : kodeBaru();
  const state = implicit ? "implisit" : holderEmail === null ? "menunggu_lokasi" : "menunggu_email";

  const nomor = await deps.billing.within(deps.db).nextNomorPemesanan();
  const [row] = await deps.db
    .insert(pemesananMakam)
    .values({
      nomor,
      kind: "tumpang",
      status: "diajukan",
      lokasiId: lokasi.id,
      lokasiName: lokasi.name,
      jenisMakamId: hakPakai.petak.jenisMakamId,
      jenisMakamName: null,
      pemesanAccountId: akun.id,
      pemesanName,
      email: pemesanEmail,
      phoneNumber: phoneOf(input.phoneNumber),
      almarhumName,
      tanggalWafat: input.tanggalWafat,
      rencanaPemakamanAt: rencanaPemakamanAt(input.rencanaPemakamanAt),
      keinginanPenempatan: teksAtauKosong(input.keinginanPenempatan),
      pemegangHak: {
        mode: "lain",
        name: hakPakai.pemegangHak?.name ?? pemesanName,
        phoneNumber: hakPakai.pemegangHak?.phoneNumber ?? null,
        email: holderEmail,
      },
      tumpangJenis: input.jenis,
      pemesananIndukNomor: await indukNomorOf(deps, input.hakPakaiId),
      hakPakaiId: hakPakai.hakPakaiId,
      petakId: hakPakai.petak.id,
      petakNomor: hakPakai.petak.nomorMakam,
      konsenState: state,
      konsenEmail: state === "menunggu_email" ? holderEmail : null,
      konsenKodeHash: kode ? hashKode(kode) : null,
      konsenKodeExpiresAt: kode ? new Date(now.getTime() + KONSEN_KODE_EXPIRES_MS) : null,
      konsenVia: implicit ? "implicit" : null,
      konsenDiputuskanPada: implicit ? now : null,
      diajukanAt: now,
    })
    .returning({ id: pemesananMakam.id, nomor: pemesananMakam.nomor });

  return {
    ok: true,
    pesanan: { id: row.id, nomor: row.nomor, status: "diajukan" },
    konsen: { state, email: state === "menunggu_email" ? holderEmail : null },
    kode,
  };
}

/** What the holder's email link sends to answer a consent request. */
export const jawabKonsenSchema = z.object({
  nomor: z.string().trim().regex(/^MKM-\d{4}-\d{6}$/),
  kode: z.string().trim().regex(/^\d{6}$/),
});
export type JawabKonsenInput = z.infer<typeof jawabKonsenSchema>;

export type JawabKonsenResult =
  | { ok: true; pesanan: { nomor: string; status: "diajukan" | "ditolak" } }
  | { ok: false; reason: "input_tidak_valid" | "pesanan_tidak_ditemukan" | "kode_salah" | "konsen_sudah_diputuskan" };

/**
 * The Pemegang Hak answers "Setujui": the order is now consensual and waits for
 * the Admin Lokasi to confirm. Anyone with the link and the code sent to the
 * recorded email may answer — the code is the permission, like a Tagihan's
 * unguessable link.
 */
export async function setujuiTumpang(deps: PemesananDeps, rawInput: unknown): Promise<JawabKonsenResult> {
  const parsed = jawabKonsenSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const order = await orderTumpang(deps, parsed.data.nomor);
  if (!order) return { ok: false, reason: "pesanan_tidak_ditemukan" };
  if (order.konsenState === "disetujui" || order.konsenState === "ditolak") return { ok: false, reason: "konsen_sudah_diputuskan" };
  const cek = await cekKode(deps, order, parsed.data.kode);
  if (!cek.ok) return cek;
  await deps.db
    .update(pemesananMakam)
    .set({ konsenState: "disetujui", konsenVia: "email", konsenDiputuskanPada: deps.clock.now(), konsenKodeHash: null, konsenKodeExpiresAt: null })
    .where(eq(pemesananMakam.id, order.id));
  return { ok: true, pesanan: { nomor: order.nomor, status: "diajukan" } };
}

/**
 * The Pemegang Hak answers "Tolak": the order becomes Ditolak with the fixed
 * reason "Pemegang Hak tidak menyetujui" (AC 1).
 */
export async function tolakTumpang(deps: PemesananDeps, rawInput: unknown): Promise<JawabKonsenResult> {
  const parsed = jawabKonsenSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const order = await orderTumpang(deps, parsed.data.nomor);
  if (!order) return { ok: false, reason: "pesanan_tidak_ditemukan" };
  if (order.konsenState === "disetujui" || order.konsenState === "ditolak") return { ok: false, reason: "konsen_sudah_diputuskan" };
  const cek = await cekKode(deps, order, parsed.data.kode);
  if (!cek.ok) return cek;
  const now = deps.clock.now();
  await deps.db
    .update(pemesananMakam)
    .set({
      status: "ditolak",
      konsenState: "ditolak",
      konsenVia: "email",
      konsenDiputuskanPada: now,
      konsenKodeHash: null,
      konsenKodeExpiresAt: null,
      ditolakPada: now,
      alasanTolak: "pemegang_hak_tidak_setuju",
    })
    .where(eq(pemesananMakam.id, order.id));
  return { ok: true, pesanan: { nomor: order.nomor, status: "ditolak" } };
}

/** What the Admin Lokasi's consent form sends for a holder with no email, or one who answered verbally. */
export const catatKonsenSchema = z.object({
  nomor: z.string().trim().regex(/^MKM-\d{4}-\d{6}$/),
  via: z.enum(["verbal", "ahli_waris"]),
  /** What was said, or what the heirship proof was. */
  catatan: z.string().trim().min(1).max(1000),
  /** The private FileStore key of the heirship proof, when one was filed. */
  buktiFileKey: z.string().trim().max(300).optional(),
});
export type CatatKonsenInput = z.infer<typeof catatKonsenSchema>;

export type CatatKonsenResult =
  | { ok: true; pesanan: { nomor: string } }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" | "pesanan_tidak_ditemukan" | "konsen_sudah_diputuskan" };

/**
 * The Admin Lokasi logs a verbal consent or an heirship proof (AC 1). Both settle
 * the consent exactly as an emailed Setujui does; they differ only in what the
 * record carries. (The Ganti Pemegang Hak reminder a proof should raise is not
 * built here; see the ticket's handoff.)
 */
export async function catatKonsenTumpang(deps: PemesananDeps, by: Actor, rawInput: unknown): Promise<CatatKonsenResult> {
  const parsed = catatKonsenSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const order = await orderTumpang(deps, parsed.data.nomor);
  if (!order) return { ok: false, reason: "pesanan_tidak_ditemukan" };
  const refusal = writeRefusal(by, "pemesanan.konfirmasi", lokasiMitraResource(order.lokasiId));
  if (refusal) return refusal;
  if (order.konsenState === "disetujui" || order.konsenState === "ditolak") return { ok: false, reason: "konsen_sudah_diputuskan" };
  await deps.db
    .update(pemesananMakam)
    .set({
      konsenState: "disetujui",
      konsenVia: parsed.data.via,
      konsenCatatan: parsed.data.catatan,
      konsenBuktiFileKey: parsed.data.buktiFileKey ?? null,
      konsenOleh: by.accountId,
      konsenDiputuskanPada: deps.clock.now(),
      konsenKodeHash: null,
      konsenKodeExpiresAt: null,
    })
    .where(eq(pemesananMakam.id, order.id));
  return { ok: true, pesanan: { nomor: order.nomor } };
}

/** What the Admin Lokasi's confirm form sends. */
export const konfirmasiTumpangSchema = z.object({
  nomor: z.string().trim().regex(/^MKM-\d{4}-\d{6}$/),
  /** The burial the Lokasi agrees with the family, as `datetime-local` holds it in WIB. */
  pemakamanAt: z.string().trim().min(1).max(40),
});
export type KonfirmasiTumpangInput = z.infer<typeof konfirmasiTumpangSchema>;

export type KonfirmasiTumpangResult =
  | {
      ok: true;
      pesanan: { nomor: string; status: "dikonfirmasi"; petakNomor: string; hakPakaiId: string };
      tagihan: { id: string; nomorTagihan: string; total: number; dueAt: Date; kind: Tagihan["kind"]; link: string };
    }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" | "pesanan_tidak_ditemukan" | "pesanan_sudah_dikonfirmasi" | "pesanan_sudah_ditutup" }
  /** The Pemegang Hak has not settled their consent yet. */
  | { ok: false; reason: "konsen_belum_selesai" }
  | { ok: false; reason: "hak_pakai_tidak_ditemukan" | "petak_tidak_ditemukan" }
  /** One of the tumpang policy checks failed; the reason names which. */
  | { ok: false; reason: "tumpang_tidak_diizinkan" | "tumpang_petak_dilepas_tidak_diizinkan" | "lapisan_penuh" | "masa_tunggu_belum_lewat" }
  | { ok: false; reason: "kontak_pemesan_kosong" | "harga_tidak_tersedia" }
  /** The Lokasi Mitra is not there any more, so its payment window cannot be read. */
  | { ok: false; reason: "lokasi_tidak_terbuka" }
  | { ok: false; reason: "tagihan_tidak_terbit" };

/**
 * Confirms one Diajukan tumpang order: the tumpang policy is checked against the
 * Lokasi's own rules and the grave's own facts, then the pay-after Tagihan is
 * issued (Biaya Pemakaman at the day's rate, the tumpang amount when the Lokasi
 * has one, plus the Biaya Layanan Platform) and due at the agreed burial plus the
 * Lokasi's Saat Duka payment window. No Hak Pakai is created and no plot changes
 * hands: this burial joins the right that already exists.
 */
export async function konfirmasiTumpang(deps: PemesananDeps, by: Actor, rawInput: unknown): Promise<KonfirmasiTumpangResult> {
  const parsed = konfirmasiTumpangSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;

  const [order] = await deps.db.select().from(pemesananMakam).where(eq(pemesananMakam.nomor, input.nomor));
  if (!order) return { ok: false, reason: "pesanan_tidak_ditemukan" };
  const refusal = writeRefusal(by, "pemesanan.konfirmasi", lokasiMitraResource(order.lokasiId));
  if (refusal) return refusal;
  if (order.status === "dikonfirmasi") return { ok: false, reason: "pesanan_sudah_dikonfirmasi" };
  if (order.status !== "diajukan") return { ok: false, reason: "pesanan_sudah_ditutup" };
  if (order.kind !== "tumpang") return { ok: false, reason: "pesanan_tidak_ditemukan" };
  if (order.konsenState !== "implisit" && order.konsenState !== "disetujui") return { ok: false, reason: "konsen_belum_selesai" };
  if (!order.hakPakaiId || !order.petakId) return { ok: false, reason: "petak_tidak_ditemukan" };

  const now = deps.clock.now();
  const hakPakai = await deps.inventory.hakPakaiUntukTumpang(order.hakPakaiId);
  if (!hakPakai) return { ok: false, reason: "hak_pakai_tidak_ditemukan" };
  const profile = await deps.lokasi.publicLokasiMitra(order.lokasiId);
  if (!profile) return { ok: false, reason: "lokasi_tidak_terbuka" };

  // The tumpang policy is about an occupied plot. A plot nobody is buried in has
  // no years to wait for and no layer taken — the next plot of a Kavling Keluarga
  // or the Calon Penghuni's own plot is not a tumpang at all — so the policy is
  // read only once the grave holds someone.
  if (hakPakai.layers > 0) {
    const diperiksa = periksaBolehTumpang(
      {
        released: hakPakai.released,
        layers: hakPakai.layers,
        terakhirPemakaman: hakPakai.terakhirPemakaman,
        hariIni: wibDateOf(now),
      },
      {
        allowed: profile.tumpang.allowed,
        minYears: profile.tumpang.minYears,
        maxLayers: profile.tumpang.maxLayers,
        onReleased: profile.tumpang.onReleasedPlots,
      },
    );
    if (!diperiksa.ok) return { ok: false, reason: diperiksa.reason };
  }

  const phoneNumber = order.phoneNumber;
  if (!phoneNumber) return { ok: false, reason: "kontak_pemesan_kosong" };
  const paymentWindowHours = await deps.lokasi.saatDukaPaymentWindowHours(order.lokasiId);
  if (paymentWindowHours === null) return { ok: false, reason: "lokasi_tidak_terbuka" };
  const pemakamanAt = wib(input.pemakamanAt);
  const harga = await deps.tariffs.quote([{ kind: "biaya_pemakaman", lokasiId: order.lokasiId, tumpang: true }], now);
  if (!harga.ok) return { ok: false, reason: "harga_tidak_tersedia" };
  const baris = linesOf(harga.lines, order);
  if (!baris.ok) return { ok: false, reason: "tagihan_tidak_terbit" };
  const lines: NewTagihanLine[] = baris.lines;

  const hasil = await deps.audit.staffWrite(deps.db, async (tx, record) => {
    const tagihan = await deps.billing.within(tx).issueTagihan({
      moment: { kind: "saat_duka", burialAt: pemakamanAt, paymentWindowHours },
      addressee: { name: order.pemesanName, phoneNumber, accountId: order.pemesanAccountId },
      nomorPemesanan: order.nomor,
      placeName: order.lokasiName,
      lines,
    });
    if (!tagihan.ok) return { ok: false as const, reason: "tagihan_tidak_terbit" as const };

    const moved = await tx
      .update(pemesananMakam)
      .set({ status: "dikonfirmasi", pemakamanAt, dikonfirmasiPada: now, tagihanId: tagihan.tagihan.id })
      .where(and(eq(pemesananMakam.id, order.id), eq(pemesananMakam.status, "diajukan")))
      .returning({ id: pemesananMakam.id });
    if (moved.length === 0) return { ok: false as const, reason: "pesanan_sudah_dikonfirmasi" as const };

    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "pemesanan.konfirmasi_tumpang",
      entity: { kind: "pemesanan_makam", id: order.id },
      lokasiId: order.lokasiId,
      before: { status: "diajukan", tagihanId: null },
      after: { status: "dikonfirmasi", petak: order.petakNomor, hakPakaiId: order.hakPakaiId, pemakamanAt: pemakamanAt.toISOString(), nomorTagihan: tagihan.tagihan.nomorTagihan },
      reason: null,
    });
    return {
      ok: true as const,
      pesanan: { nomor: order.nomor, status: "dikonfirmasi" as const, petakNomor: order.petakNomor ?? "", hakPakaiId: order.hakPakaiId! },
      tagihan: {
        id: tagihan.tagihan.id,
        nomorTagihan: tagihan.tagihan.nomorTagihan,
        total: tagihan.tagihan.total,
        dueAt: tagihan.tagihan.dueAt,
        kind: tagihan.tagihan.kind,
        link: tagihan.tagihan.link,
      },
    };
  });
  return hasil;
}

/** The order of a Nomor Pemesanan when it is a further burial, else null. */
async function orderTumpang(deps: PemesananDeps, nomor: string) {
  const [order] = await deps.db.select().from(pemesananMakam).where(eq(pemesananMakam.nomor, nomor));
  return order && order.kind === "tumpang" ? order : null;
}

/** A stored code's hash, its still-valid window and the wrong-answer count decide the answer. */
async function cekKode(deps: PemesananDeps, order: { id: string; konsenKodeHash: string | null; konsenKodeExpiresAt: Date | null; konsenSalah: number }, kode: string): Promise<{ ok: true } | { ok: false; reason: "kode_salah" }> {
  const now = deps.clock.now();
  if (!order.konsenKodeHash || !order.konsenKodeExpiresAt || order.konsenKodeExpiresAt.getTime() < now.getTime()) return { ok: false, reason: "kode_salah" };
  if (kodeBenar(order.konsenKodeHash, kode)) return { ok: true };
  const salah = order.konsenSalah + 1;
  // The 5th wrong code burns the code; a new request must be sent (the Kode Masuk's rule).
  await deps.db
    .update(pemesananMakam)
    .set(salah >= KONSEN_KODE_MAX_SALAH ? { konsenSalah: salah, konsenKodeHash: null, konsenKodeExpiresAt: null } : { konsenSalah: salah })
    .where(eq(pemesananMakam.id, order.id));
  return { ok: false, reason: "kode_salah" };
}

/** A six-digit code, padded so a leading zero is a digit like any other. */
function kodeBaru(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** A fresh salt and the scrypt hash of the code, as `salt:hash`; the code itself is never stored. */
function hashKode(kode: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(kode, salt, 32).toString("hex")}`;
}

/** Whether `kode` hashes to what `stored` holds, compared without leaking where they first differ. */
function kodeBenar(stored: string, kode: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hitung = scryptSync(kode, salt, 32);
  const tersimpan = Buffer.from(hash, "hex");
  return hitung.length === tersimpan.length && timingSafeEqual(hitung, tersimpan);
}

/**
 * The Nomor Pemesanan of the Pemesanan Terencana whose plot this Hak Pakai is, or
 * null. It is what lets the burial tell Payouts about the Terencana order too, so
 * its Pencairan becomes due at the first Pemakaman when that is sooner than the
 * end of the Masa Pembatalan (ticket 35's AC 20, moved from ticket 90).
 */
export async function indukNomorOf(deps: Pick<PemesananDeps, "db">, hakPakaiId: string): Promise<string | null> {
  const [unit] = await deps.db
    .select({ pemesananId: pemesananTerencanaUnit.pemesananId })
    .from(pemesananTerencanaUnit)
    .where(eq(pemesananTerencanaUnit.hakPakaiId, hakPakaiId))
    .limit(1);
  if (!unit) return null;
  const [induk] = await deps.db.select({ nomor: pemesananTerencana.nomor }).from(pemesananTerencana).where(eq(pemesananTerencana.id, unit.pemesananId));
  return induk?.nomor ?? null;
}

function rencanaPemakamanAt(typed: string | undefined): Date | null {
  const trimmed = typed?.trim() ?? "";
  return trimmed === "" ? null : wib(trimmed);
}

function teksAtauKosong(typed: string | undefined): string | null {
  const trimmed = typed?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/** A contact number as typed: a tumpang order's Pemesan has no contact field of its own. */
function phoneOf(typed: string | undefined): string | null {
  const trimmed = typed?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}
