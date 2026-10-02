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
 * else an emailed request to the Pemegang Hak, who signs in with the usual Kode
 * Masuk and answers Setujui / Tolak under Perlu tindakan in Akun Saya (owner,
 * 2026-10-02: no code of its own, no new secret); else verbal consent logged by
 * the Admin Lokasi; else heirship proof, which raises a Ganti Pemegang Hak
 * reminder. Only an implicit or settled consent lets the Admin Lokasi confirm.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { normaliseEmail, writeRefusal, lokasiMitraResource, type Actor, type WriteRefusal } from "@/domain/identity";
import { periksaBolehTumpang } from "@/domain/inventory";
import { wib, wibDateOf } from "@/lib/time/jakarta";
import { foldKey } from "@/lib/fold-key";
import { linesOf } from "./konfirmasi-saat-duka";
import { penerimaOf } from "./saat-duka";
import { tagihanPerluDibayar, type NewTagihanLine, type Tagihan } from "@/domain/billing";
import type { PemesananDeps } from "./deps";
import { pemesananMakam, pemesananTerencana, pemesananTerencanaUnit, tumpangJenisKeys } from "./schema";

/** The tumpang request "Data & kirim" sends: only the Almarhum and the Pemesan, plus the grave's own address. */
export const ajukanTumpangSchema = z.object({
  pemesanAccountId: z.string().trim().min(1),
  pemesanEmail: z.string().trim().min(1).max(320),
  pemesanName: z.string().trim().min(1).max(200),
  phoneNumber: z.string().trim().max(30).optional(),
  lokasiId: z.uuid(),
  hakPakaiId: z.uuid(),
  /** The member Petak of a Kavling Keluarga the burial goes to; ignored for a single Petak. */
  petakId: z.uuid().optional(),
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
      konsen: { state: "implisit" | "menunggu_pemegang" | "menunggu_lokasi" };
    }
  | { ok: false; reason: "input_tidak_valid" }
  | { ok: false; reason: "email_bukan_akun_ini" }
  | { ok: false; reason: "hak_pakai_tidak_ditemukan" }
  /** The Hak Pakai at another Lokasi Mitra than the one the request names. */
  | { ok: false; reason: "lokasi_beda" }
  /** A Kavling Keluarga's next plot needs a member Petak chosen; a single Petak takes none. */
  | { ok: false; reason: "petak_tidak_ditemukan" }
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
  const petak = hakPakai.petak ?? hakPakai.kavling?.petak.find((satu) => satu.id === input.petakId) ?? null;
  if (!petak) return { ok: false, reason: "petak_tidak_ditemukan" };

  const lokasi = await deps.lokasi.publicLokasiMitra(input.lokasiId);
  if (!lokasi) return { ok: false, reason: "lokasi_tidak_terbuka" };

  const now = deps.clock.now();
  const holderEmail = hakPakai.pemegangHak?.email ? normaliseEmail(hakPakai.pemegangHak.email) : null;
  const pemesanEmail = normaliseEmail(input.pemesanEmail)!;
  const implicit = holderEmail !== null && holderEmail === pemesanEmail;
  const state = implicit ? "implisit" : holderEmail === null ? "menunggu_lokasi" : "menunggu_pemegang";

  const nomor = await deps.billing.within(deps.db).nextNomorPemesanan();
  const [row] = await deps.db
    .insert(pemesananMakam)
    .values({
      nomor,
      kind: "tumpang",
      status: "diajukan",
      lokasiId: lokasi.id,
      lokasiName: lokasi.name,
      jenisMakamId: petak.jenisMakamId,
      jenisMakamName: null,
      pemesanAccountId: akun.id,
      pemesanName,
      email: pemesanEmail,
      phoneNumber: phoneOf(input.phoneNumber) ?? akun.phoneNumber,
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
      petakId: petak.id,
      petakNomor: petak.nomorMakam,
      konsenState: state,
      konsenEmail: state === "menunggu_pemegang" ? holderEmail : null,
      konsenVia: implicit ? "implicit" : null,
      konsenDiputuskanPada: implicit ? now : null,
      diajukanAt: now,
    })
    .returning({ id: pemesananMakam.id, nomor: pemesananMakam.nomor });

  // The consent request is an ordinary email with a link to Akun Saya: the holder
  // signs in with the usual Kode Masuk, so the message carries no code of its own.
  if (state === "menunggu_pemegang" && holderEmail) {
    await deps.notifikasi.tumpangMintaPersetujuan({
      pemesananId: row.id,
      nomor: row.nomor,
      email: holderEmail,
      pemegangHakName: hakPakai.pemegangHak?.name ?? pemesanName,
      pemesanName,
      lokasi: { id: lokasi.id, name: lokasi.name },
      almarhum: { name: almarhumName, tanggalWafat: input.tanggalWafat },
    });
  }
  return { ok: true, pesanan: { id: row.id, nomor: row.nomor, status: "diajukan" }, konsen: { state } };
}

/** What the Pemegang Hak's answer under Perlu tindakan sends. */
export const jawabKonsenSchema = z.object({
  nomor: z.string().trim().regex(/^MKM-\d{4}-\d{6}$/),
  jawaban: z.enum(["setuju", "tolak"]),
});
export type JawabKonsenInput = z.infer<typeof jawabKonsenSchema>;

export type JawabKonsenResult =
  | { ok: true; pesanan: { nomor: string; status: "diajukan" | "ditolak" } }
  | {
      ok: false;
      reason: "input_tidak_valid" | "pesanan_tidak_ditemukan" | "bukan_pemegang_hak" | "konsen_sudah_diputuskan";
    };

/**
 * The Pemegang Hak answers Setujui or Tolak, signed in with the usual Kode Masuk:
 * the permission is that the signed-in Akun's Email Terverifikasi is the email the
 * Hak Pakai records for its holder. Setujui leaves the order for the Admin Lokasi
 * to confirm; Tolak ends it Ditolak with the fixed reason "Pemegang Hak tidak
 * menyetujui".
 */
export async function jawabKonsenTumpang(deps: PemesananDeps, by: Pick<Actor, "accountId">, rawInput: unknown): Promise<JawabKonsenResult> {
  const parsed = jawabKonsenSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const order = await orderTumpang(deps, parsed.data.nomor);
  if (!order) return { ok: false, reason: "pesanan_tidak_ditemukan" };
  if (order.konsenState !== "menunggu_pemegang" && order.konsenState !== "menunggu_lokasi") return { ok: false, reason: "konsen_sudah_diputuskan" };
  const pemegang = order.konsenEmail ? await deps.identity.accountByEmail(order.konsenEmail) : null;
  if (order.konsenState !== "menunggu_pemegang" || !pemegang || pemegang.id !== by.accountId) return { ok: false, reason: "bukan_pemegang_hak" };
  const now = deps.clock.now();
  if (parsed.data.jawaban === "setuju") {
    await deps.db
      .update(pemesananMakam)
      .set({ konsenState: "disetujui", konsenVia: "email", konsenDiputuskanPada: now })
      .where(and(eq(pemesananMakam.id, order.id), eq(pemesananMakam.konsenState, "menunggu_pemegang")));
    return { ok: true, pesanan: { nomor: order.nomor, status: "diajukan" } };
  }
  await deps.db
    .update(pemesananMakam)
    .set({ status: "ditolak", konsenState: "ditolak", konsenVia: "email", konsenDiputuskanPada: now, ditolakPada: now, alasanTolak: "pemegang_hak_tidak_setuju" })
    .where(and(eq(pemesananMakam.id, order.id), eq(pemesananMakam.konsenState, "menunggu_pemegang")));
  return { ok: true, pesanan: { nomor: order.nomor, status: "ditolak" } };
}

/** One consent request waiting for this Akun under Perlu tindakan. */
export interface KonsenMenunggu {
  nomor: string;
  lokasiName: string;
  pemesanName: string;
  almarhumName: string;
}

/**
 * The consent requests waiting for the Pemegang Hak behind this Akun: orders
 * still Diajukan whose consent waits on the holder and whose recorded holder email
 * is this Akun's Email Terverifikasi. It clears itself the moment they answer.
 */
export async function konsenMenungguSaya(deps: PemesananDeps, who: { accountId: string }): Promise<KonsenMenunggu[]> {
  const rows = await deps.db
    .select()
    .from(pemesananMakam)
    .where(and(eq(pemesananMakam.kind, "tumpang"), eq(pemesananMakam.status, "diajukan"), eq(pemesananMakam.konsenState, "menunggu_pemegang")))
    .orderBy(desc(pemesananMakam.diajukanAt), pemesananMakam.nomor);
  const milik: KonsenMenunggu[] = [];
  for (const row of rows) {
    const akun = row.konsenEmail ? await deps.identity.accountByEmail(row.konsenEmail) : null;
    if (akun?.id === who.accountId) milik.push({ nomor: row.nomor, lokasiName: row.lokasiName, pemesanName: row.pemesanName, almarhumName: row.almarhumName });
  }
  return milik;
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
 * record carries. An heirship proof also raises the Ganti Pemegang Hak reminder
 * the Admin Lokasi reads on the order (`tumpang.gantiPemegangHakDiingatkan`).
 */
export async function catatKonsenTumpang(deps: PemesananDeps, by: Actor, rawInput: unknown): Promise<CatatKonsenResult> {
  const parsed = catatKonsenSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const order = await orderTumpang(deps, parsed.data.nomor);
  if (!order) return { ok: false, reason: "pesanan_tidak_ditemukan" };
  const refusal = writeRefusal(by, "pemesanan.konfirmasi", lokasiMitraResource(order.lokasiId));
  if (refusal) return refusal;
  if (order.status !== "diajukan" || order.konsenState === "disetujui" || order.konsenState === "ditolak") return { ok: false, reason: "konsen_sudah_diputuskan" };
  const penerima = parsed.data.via === "ahli_waris" ? await penerimaOf(deps, order.lokasiId) : [];
  const now = deps.clock.now();
  const dicatat = await deps.audit.staffWrite(deps.db, async (tx, record) => {
    const moved = await tx
      .update(pemesananMakam)
      .set({
        konsenState: "disetujui",
        konsenVia: parsed.data.via,
        konsenCatatan: parsed.data.catatan,
        konsenBuktiFileKey: parsed.data.buktiFileKey ?? null,
        konsenOleh: by.accountId,
        konsenDiputuskanPada: now,
      })
      .where(and(eq(pemesananMakam.id, order.id), inArray(pemesananMakam.konsenState, ["menunggu_pemegang", "menunggu_lokasi"])))
      .returning({ id: pemesananMakam.id });
    if (moved.length === 0) return { ok: false as const, reason: "konsen_sudah_diputuskan" as const };
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "pemesanan.konsen_tumpang",
      entity: { kind: "pemesanan_makam", id: order.id },
      lokasiId: order.lokasiId,
      before: { konsen: order.konsenState },
      after: { konsen: "disetujui", via: parsed.data.via },
      reason: parsed.data.catatan,
    });
    // An heirship proof asks the Admin Lokasi to record a Ganti Pemegang Hak: a Peringatan Staf (bell + email), queued with the consent.
    if (parsed.data.via === "ahli_waris") {
      await deps.notifikasi.peringatanStafAhliWaris(tx, {
        id: order.id,
        nomor: order.nomor,
        lokasi: { id: order.lokasiId, name: order.lokasiName },
        almarhumName: order.almarhumName,
        penerima,
      });
    }
    return { ok: true as const };
  });
  if (!dicatat.ok) return dicatat;
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
  const hakPakai = await deps.inventory.hakPakaiUntukTumpang(order.hakPakaiId, order.petakId ?? undefined);
  if (!hakPakai) return { ok: false, reason: "hak_pakai_tidak_ditemukan" };
  const profile = await deps.lokasi.publicLokasiMitra(order.lokasiId);
  if (!profile) return { ok: false, reason: "lokasi_tidak_terbuka" };

  // The tumpang policy is about an occupied plot. The next plot of a Kavling
  // Keluarga or the Calon Penghuni's own plot is not a tumpang at all (no years to
  // wait for, no layer taken), so the policy is read only for a request that is
  // one, and only once the grave holds someone.
  if (order.tumpangJenis === "tumpang" && hakPakai.layers > 0) {
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

/** What the Admin Lokasi reads of a further burial beside the order itself: consent, checks and unpaid earlier Tagihan. */
export interface TumpangUntukStaf {
  jenis: (typeof tumpangJenisKeys)[number];
  konsen: { state: NonNullable<typeof pemesananMakam.$inferSelect["konsenState"]>; via: typeof pemesananMakam.$inferSelect["konsenVia"]; catatan: string | null };
  /** An heirship proof was logged: the Admin Lokasi is reminded to record a Ganti Pemegang Hak. */
  gantiPemegangHakDiingatkan: boolean;
  /** The tumpang policy checks as they stand today; a failing one blocks confirmation and says why. */
  pemeriksaan: { ok: true } | { ok: false; reason: "tumpang_tidak_diizinkan" | "tumpang_petak_dilepas_tidak_diizinkan" | "lapisan_penuh" | "masa_tunggu_belum_lewat" };
  /** Earlier orders under the same Hak Pakai whose Tagihan is still unpaid: the warning banner. */
  tagihanSebelumnyaBelumLunas: { nomorPesanan: string; nomorTagihan: string }[];
}

/** The consent state, policy checks and unpaid earlier Tagihan of one further-burial order; null for any other order. */
export async function tumpangUntukStaf(deps: PemesananDeps, row: typeof pemesananMakam.$inferSelect): Promise<TumpangUntukStaf | null> {
  if (row.kind !== "tumpang" || !row.tumpangJenis || !row.konsenState) return null;
  let pemeriksaan: TumpangUntukStaf["pemeriksaan"] = { ok: true };
  if (row.hakPakaiId && row.tumpangJenis === "tumpang") {
    const hak = await deps.inventory.hakPakaiUntukTumpang(row.hakPakaiId, row.petakId ?? undefined);
    const profil = await deps.lokasi.publicLokasiMitra(row.lokasiId);
    if (hak && profil && hak.layers > 0) {
      const diperiksa = periksaBolehTumpang(
        { released: hak.released, layers: hak.layers, terakhirPemakaman: hak.terakhirPemakaman, hariIni: wibDateOf(deps.clock.now()) },
        { allowed: profil.tumpang.allowed, minYears: profil.tumpang.minYears, maxLayers: profil.tumpang.maxLayers, onReleased: profil.tumpang.onReleasedPlots },
      );
      if (!diperiksa.ok) pemeriksaan = diperiksa;
    }
  }
  const sebelumnya = row.hakPakaiId
    ? await deps.db
        .select({ id: pemesananMakam.id, nomor: pemesananMakam.nomor, tagihanId: pemesananMakam.tagihanId })
        .from(pemesananMakam)
        .where(and(eq(pemesananMakam.hakPakaiId, row.hakPakaiId), inArray(pemesananMakam.status, ["dikonfirmasi", "dimakamkan"])))
    : [];
  const belumLunas: TumpangUntukStaf["tagihanSebelumnyaBelumLunas"] = [];
  for (const order of sebelumnya) {
    if (order.id === row.id || !order.tagihanId) continue;
    const tagihan = await deps.billing.within(deps.db).tagihan(order.tagihanId);
    if (tagihan && tagihanPerluDibayar(tagihan.status)) belumLunas.push({ nomorPesanan: order.nomor, nomorTagihan: tagihan.nomorTagihan });
  }
  return {
    jenis: row.tumpangJenis,
    konsen: { state: row.konsenState, via: row.konsenVia, catatan: row.konsenCatatan },
    gantiPemegangHakDiingatkan: row.konsenVia === "ahli_waris",
    pemeriksaan,
    tagihanSebelumnyaBelumLunas: belumLunas,
  };
}
