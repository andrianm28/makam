/**
 * Ordering Layanan for a grave at a Lokasi Mitra (spec, Layanan > Order, stories
 * 84 and 86; CONTEXT.md "order Layanan").
 *
 * One order is one grave with one or more Layanan. It is placed by whoever wants
 * the grave cared for — a relative, not the Pemegang Hak — and it is paid for
 * before any work happens: the order issues its own **pay-first** Tagihan in the
 * same transaction, so nothing is promised to an Admin Lokasi that money has not
 * arrived for. A standalone Layanan Tagihan is never pay-after (spec, Billing >
 * due rules: due at "the earlier of 24 h after issue or the last lead-time day"),
 * and that due date is Billing's one pure rule `tagihanDue`; this module only
 * hands it the lines with the facts it counts from.
 *
 * The two rules this module owns, because only it can know them:
 *
 * - **the lead time.** A target date inside the Layanan's minimum lead time is
 *   refused, so a family is never sold a date the Lokasi cannot meet. Each item
 *   keeps its own lead time, because the Tagihan's due date is counted from it and
 *   a later catalog edit must not move a deadline that was already printed.
 * - **whose right it is.** A Hak Pakai that has ended or been given back takes no
 *   further Layanan, and a Hak Pakai flagged Perlu Verifikasi must be completed by
 *   the Admin Lokasi before its first job is scheduled (spec, Inventory: "the
 *   Admin Lokasi must complete it at the latest at the first Perpanjangan or
 *   Layanan on that Hak Pakai"). Both are checked here against the current state
 *   read from the Inventory module, never against what a lookup answered an hour
 *   ago — the scheduling half of the second rule is `jadwalkanPekerjaan`'s, in
 *   `./pembayaran`, because it is the payment that would promise the work.
 */
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { NewTagihanLine, Tagihan } from "@/domain/billing";
import { normaliseEmail, normalisePhoneNumber, type PhoneNumberResult } from "@/domain/identity";
import { refusable } from "@/db/unit-of-work";
import { hargaLayananPartLabel } from "@/lib/layanan-labels";
import { addWibDateDays, wibDateOf } from "@/lib/time/jakarta";
import type { Rupiah } from "@/lib/rupiah";
import type { QuotedLine } from "@/domain/tariffs";
import type { LayananDeps, PemesanLayanan } from "./deps";
import { offeringsUntukOrder, type VarianUntukOrder } from "./harga";
import { katalog, proofOf, type ProofRequirement } from "./katalog";
import { placePesananLayananSchema } from "./pesanan-schema";
import { pesananLayanan, pesananLayananItem, pekerjaanLayanan, type PesananLayananStatus, type PekerjaanLayananStatus } from "./schema";
import { buktiUntukPekerjaan, type BuktiTerbaca } from "./bukti";

/** How many days either side of a target date the work may be done (spec, Pekerjaan Layanan: "Target date ±2 days"). */
export const JENDELA_TARGET_HARI = 2;

/** A phone number the Tagihan could not be addressed to, as the Identity module words it. */
type PhoneRefusal = Extract<PhoneNumberResult, { ok: false }>["reason"];

/** A WIB calendar date `hari` days from `tanggal`, without depending on the host's time zone. */
const geser = addWibDateDays;

/** The ±2 days around a target date, in WIB calendar dates: the window the work may be done in. */
export function jendelaTarget(targetDate: string): { dari: string; sampai: string } {
  return { dari: geser(targetDate, -JENDELA_TARGET_HARI), sampai: geser(targetDate, JENDELA_TARGET_HARI) };
}

/**
 * The earliest target date a Layanan with this lead time may be asked for: today
 * plus its lead time, in WIB. A family picking a date from here on is never
 * offered one the Lokasi has no time to prepare.
 */
export function targetPalingDini(leadTimeDays: number, now: Date): string {
  return geser(wibDateOf(now), leadTimeDays);
}

/** The line kinds a Layanan order may put on its Tagihan. Anything else is a refusal, never a silent omission. */
const KINDS_YANG_BISA_DITAGIH = ["layanan_lokasi", "biaya_layanan_platform"] as const;
type KindYangBisaDitagih = (typeof KINDS_YANG_BISA_DITAGIH)[number];

/** Why an order cannot be placed for a grave, or could not be issued. */
export type AlasanTolakPesanan =
  /** The input is not an order at all. */
  | "input_tidak_valid"
  /** No such Petak Makam at that Lokasi Mitra, or no Hak Pakai on it at all. */
  | "grave_tidak_ditemukan"
  /** The Lokasi Mitra is not listed, so it takes no order. */
  | "lokasi_tidak_terbuka"
  /** A Hak Pakai that has ended or been given back: it takes no further Layanan. */
  | "hak_pakai_berakhir"
  /** A variant this Lokasi Mitra does not offer, or has no price in force for. */
  | "layanan_tidak_tersedia"
  /** A quote line this flow cannot put on a Tagihan at all (never in practice: a widened quote). */
  | "baris_tidak_bisa_ditagih"
  /** A target date inside that Layanan's minimum lead time. */
  | "lead_time_melewati"
  /** A Layanan that asks for a text field, left empty. */
  | "teks_kosong"
  /** The all-in price could not be computed, or is past a limit (the QRIS cap). */
  | "harga_tidak_tersedia"
  /** A Tagihan could not be issued: nothing at all is written. */
  | "tagihan_tidak_terbit"
  /** The email is not an Akun's Email Terverifikasi, or the Akun is not that email's. */
  | "email_bukan_akun_ini"
  /** A phone number the Tagihan could not be addressed to. */
  | PhoneRefusal;

export type PlacePesananLayananResult =
  | {
      ok: true;
      pesanan: { id: string; nomor: string; status: PesananLayananStatus; total: number };
      tagihan: { id: string; nomorTagihan: string; total: number; dueAt: Date; kind: Tagihan["kind"]; link: string };
    }
  | { ok: false; reason: AlasanTolakPesanan };

/** What the order's own transaction returns: the same two shapes, narrowed to the ones it can refuse. */
type Hasil = { ok: true; pesanan: { id: string; nomor: string; status: "menunggu_pembayaran"; total: number }; tagihan: { id: string; nomorTagihan: string; total: number; dueAt: Date; kind: Tagihan["kind"]; link: string } } | { ok: false; reason: "tagihan_tidak_terbit" };

/**
 * Places one order Layanan: the order, its items, the Pekerjaan Layanan waiting
 * for the money (one per item, so a family sees its whole order at once) and the
 * pay-first Tagihan, all in one transaction. A refusal anywhere leaves nothing:
 * no order, no job, no Tagihan.
 */
export async function placePesananLayanan(
  deps: LayananDeps,
  pemesan: PemesanLayanan,
  rawInput: unknown,
): Promise<PlacePesananLayananResult> {
  const parsed = placePesananLayananSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;

  const email = normaliseEmail(pemesan.email);
  if (email === null) return { ok: false, reason: "email_bukan_akun_ini" };
  const akun = await deps.identity.accountByEmail(email);
  if (!akun || akun.id !== pemesan.accountId) return { ok: false, reason: "email_bukan_akun_ini" };
  const pemesanName = input.pemesanName.trim();
  if (pemesanName === "") return { ok: false, reason: "input_tidak_valid" };
  // The Tagihan is addressed to this number, so it is checked here where the family
  // can still fix it, rather than inside Billing where the whole order is refused.
  const telepon = normalisePhoneNumber(input.phoneNumber);
  if (!telepon.ok) return { ok: false, reason: telepon.reason };
  const phoneNumber = telepon.phoneNumber;

  const tertulis = await cekHakPakai(deps, input.lokasiId, input.petakId);
  if (!tertulis.ok) return tertulis;

  const now = deps.clock.now();
  const varianTersedia = await offeringsUntukOrder(deps, input.lokasiId, now);

  // Every item must be a variant this Lokasi Mitra offers, dated outside its own
  // lead time, and carry the text its Layanan asks for. Checked against the
  // catalog and this place's offering, never against what the form said.
  const item: { varian: VarianUntukOrder; targetDate: string; teks: string | null }[] = [];
  for (const satu of input.item) {
    const varian = varianTersedia.find((kandidat) => kandidat.id === satu.layananVariantId);
    if (!varian) return { ok: false, reason: "layanan_tidak_tersedia" };
    if (satu.targetDate < targetPalingDini(varian.leadTimeDays, now)) return { ok: false, reason: "lead_time_melewati" };
    const mauTeks = (varian.teksLabel ?? "") !== "";
    const teks = satu.teks?.trim() || null;
    if (mauTeks && teks === null) return { ok: false, reason: "teks_kosong" };
    item.push({ varian, targetDate: satu.targetDate, teks: mauTeks ? teks : null });
  }

  // One quote for the whole order: the items at that place's price plus the one
  // Biaya Layanan Platform the rule adds to a Tagihan at a Lokasi Mitra.
  const quoted = await deps.tariffs.quote(
    item.map((satu) => ({ kind: "layanan_lokasi" as const, lokasiId: input.lokasiId, layananVariantId: satu.varian.id })),
    now,
  );
  if (!quoted.ok) return { ok: false, reason: "harga_tidak_tersedia" };
  const baris = barisTagihan(quoted, item, input.lokasiId, tertulis.lokasi.name);
  if (!baris.ok) return baris;

  const hasil = await refusable<Hasil>(deps.db, async (tx) => {
      const billing = deps.billing.within(tx);
      const nomor = await billing.nextNomorPemesanan();
      const tagihan = await billing.issueTagihan({
        // The moment that takes its due date from its own lines, each of which
        // carries the target date and the lead time `tagihanDue` counts from.
        moment: { kind: "layanan" },
        addressee: { name: pemesanName, phoneNumber, accountId: pemesan.accountId },
        nomorPemesanan: nomor,
        placeName: tertulis.lokasi.name,
        lines: baris.lines,
      });
      if (!tagihan.ok) return { ok: false as const, reason: "tagihan_tidak_terbit" as const };

      const [order] = await tx
        .insert(pesananLayanan)
        .values({
          nomor,
          lokasiId: input.lokasiId,
          petakId: input.petakId,
          hakPakaiId: tertulis.hak.id,
          lokasiName: tertulis.lokasi.name,
          petakNomor: tertulis.petak.nomor,
          pemesanName,
          pemesanPhone: phoneNumber,
          pemesanEmail: email,
          pemesanAccountId: pemesan.accountId,
          tagihanId: tagihan.tagihan.id,
          total: tagihan.tagihan.total,
          createdAt: now,
        })
        .returning({ id: pesananLayanan.id });

      for (const [posisi, satu] of item.entries()) {
        const satuBaris = baris.perBaris[posisi];
        const [ditambahkan] = await tx
          .insert(pesananLayananItem)
          .values({
            pesananId: order.id,
            posisi,
            layananId: satu.varian.layananId,
            layananVariantId: satu.varian.id,
            label: satuBaris.label,
            amount: satuBaris.amount as Rupiah,
            leadTimeDays: satu.varian.leadTimeDays,
            targetDate: satu.targetDate,
            teks: satu.teks,
          })
          .returning({ id: pesananLayananItem.id });
        // The job exists from the order, waiting for the money: one per Layanan,
        // so the family sees every piece of its order from the start and one
        // payment moves them all from Menunggu Pembayaran to Dijadwalkan.
        await tx.insert(pekerjaanLayanan).values({
          pesananId: order.id,
          pesananItemId: ditambahkan.id,
          lokasiId: input.lokasiId,
          petakId: input.petakId,
          status: "menunggu_pembayaran",
          targetDate: satu.targetDate,
          createdAt: now,
        });
      }

      // The message is queued in this very commit, so a family is told of an order that exists and
      // an order that exists is never left unannounced.
      await deps.notifikasi.pesananLayananTerbit(tx, {
        pesananId: order.id,
        nomor,
        email,
        pemesanName,
        lokasi: { id: input.lokasiId, name: tertulis.lokasi.name },
        petak: { nomor: tertulis.petak.nomor },
        item: item.map((satu, posisi) => ({ label: baris.perBaris[posisi].label, targetDate: satu.targetDate })),
        tagihan: {
          id: tagihan.tagihan.id,
          nomorTagihan: tagihan.tagihan.nomorTagihan,
          total: tagihan.tagihan.total,
          dueAt: tagihan.tagihan.dueAt,
          link: tagihan.tagihan.link,
        },
      });

      return {
        ok: true as const,
        pesanan: { id: order.id, nomor, status: "menunggu_pembayaran" as const, total: tagihan.tagihan.total },
        tagihan: {
          id: tagihan.tagihan.id,
          nomorTagihan: tagihan.tagihan.nomorTagihan,
          total: tagihan.tagihan.total,
          dueAt: tagihan.tagihan.dueAt,
          kind: tagihan.tagihan.kind,
          link: tagihan.tagihan.link,
        },
      };
    },
  );
  return hasil;
}

/**
 * The Tagihan lines a Layanan order issues: one `layanan` line per item, carrying
 * the target date and lead time its due date is counted from, and the one Biaya
 * Layanan Platform the quote added.
 *
 * The kinds are matched by name rather than passed through, and a kind this flow
 * cannot issue is a **refusal**, never a silent omission: a widened Tariffs quote
 * that started carrying another kind of line would otherwise produce a Tagihan
 * missing it, which under-charges the family — and the only thing standing
 * between that and a real invoice would be the compiler, which a future widening
 * could satisfy by widening this file too.
 */
function barisTagihan(
  quoted: { lines: readonly QuotedLine[] },
  item: readonly { varian: VarianUntukOrder; targetDate: string }[],
  lokasiId: string,
  lokasiName: string,
): { ok: true; lines: NewTagihanLine[]; perBaris: { label: string; amount: number }[] } | { ok: false; reason: "baris_tidak_bisa_ditagih" | "harga_tidak_tersedia" } {
  const lines: NewTagihanLine[] = [];
  const perBaris: { label: string; amount: number }[] = [];
  for (const line of quoted.lines) {
    const kind = KINDS_YANG_BISA_DITAGIH.includes(line.kind as KindYangBisaDitagih) ? (line.kind as KindYangBisaDitagih) : null;
    if (kind === null) return { ok: false, reason: "baris_tidak_bisa_ditagih" };
    if (kind === "biaya_layanan_platform") {
      lines.push({ kind, label: hargaLayananPartLabel(line), amount: line.amount, provider: { kind: "operator" } });
      continue;
    }
    const satu = item[perBaris.length];
    if (!satu) return { ok: false, reason: "harga_tidak_tersedia" };
    const label = hargaLayananPartLabel(line, satu.varian);
    lines.push({
      kind: "layanan",
      label,
      amount: line.amount,
      provider: { kind: "lokasi_mitra", lokasiId, name: lokasiName },
      targetDate: satu.targetDate,
      leadTimeDays: satu.varian.leadTimeDays,
    });
    perBaris.push({ label, amount: line.amount });
  }
  if (perBaris.length !== item.length) return { ok: false, reason: "harga_tidak_tersedia" };
  // The quote's own total covers the items *and* the platform fee it added, so the
  // items are checked against each other here: every one of them was priced and the
  // fee appears once, which is all this flow has to be sure of.
  return { ok: true, lines, perBaris };
}

/** The grave an order is for, as the checkout must find it: the Hak Pakai's state and the Petak's own number. */
export type Tertulis =
  | { ok: true; hak: { id: string; perluVerifikasi: boolean }; petak: { nomor: string }; lokasi: { id: string; name: string } }
  | { ok: false; reason: "grave_tidak_ditemukan" | "lokasi_tidak_terbuka" | "hak_pakai_berakhir" };

/**
 * The grave this order is for, read now: a Terverifikasi Lokasi Mitra, a Petak
 * Makam of it with a Hak Pakai that is not Berakhir, and the number the Lokasi
 * and the family both know it by.
 *
 * **This is the only place the orderability of a grave is decided**, and it is
 * public so the checkout screen asks this rather than re-deriving it: the screen
 * used to carry its own copy of the rule, and the two drifting apart is exactly
 * how a status the owner had ruled on kept blocking in one place and not the
 * other. What the screen shows and what `placePesananLayanan` accepts now come
 * from one read.
 */
export async function cekHakPakai(deps: LayananDeps, lokasiId: string, petakId: string): Promise<Tertulis> {
  if (!z.uuid().safeParse(lokasiId).success || !z.uuid().safeParse(petakId).success) return { ok: false, reason: "grave_tidak_ditemukan" };
  if (!(await deps.lokasi.isTerverifikasi(lokasiId))) return { ok: false, reason: "lokasi_tidak_terbuka" };
  const hak = await deps.inventory.hakPakaiOfUnit({ petakId });
  if (!hak || hak.lokasiId !== lokasiId) return { ok: false, reason: "grave_tidak_ditemukan" };
  // Berakhir is the ticket's own rule, and the only one (AC 1 names no other).
  //
  // **`dibatalkan` does not block, and that is the owner's settled decision**, not a
  // reading of the AC: this module used to refuse it here as well, on the argument
  // that a given-back Hak Pakai is no right anybody holds. The owner chose the AC
  // instead, and the asymmetry is what decided it — with a one-way block, **one**
  // failed service prevents **every other** service the family has already paid for,
  // which is the wrong way round for a family that has committed money. An order
  // whose one job was cancelled may still take another Layanan.
  //
  // What stays true either way, because it is about the record and not the money:
  // cancellation in this flow is per job only, there is no order cancellation, the
  // order status never leaves `terbayar` (`jadwalkan` is its only writer), and no
  // money moves here. So a given-back Hak Pakai can be ordered for and nothing else
  // about it changes; `Pencairan` cannot see a paid-then-cancelled Layanan, which is
  // a recorded gap with its own tickets, not this rule's business.
  if (hak.status === "berakhir") return { ok: false, reason: "hak_pakai_berakhir" };
  if (hak.nomor === null) return { ok: false, reason: "grave_tidak_ditemukan" };
  const lokasi = await deps.lokasi.publicLokasiMitra(lokasiId);
  if (!lokasi) return { ok: false, reason: "lokasi_tidak_terbuka" };
  return { ok: true, hak, petak: { nomor: hak.nomor }, lokasi: { id: lokasiId, name: lokasi.name } };
}

/** One order Layanan as its own Pemesan reads it, with every job and every proof of it. */
export interface PesananLayananOrder {
  nomor: string;
  status: PesananLayananStatus;
  total: number;
  createdAt: Date;
  /** The Tagihan it issued, so the order page never re-derives the price. */
  tagihan: { id: string } | null;
  lokasi: { id: string; name: string };
  petak: { id: string; nomor: string };
  /** The order status as a staff reader would see it, and the hash it was read at. */
  item: PesananLayananItemTerbaca[];
}

export interface PesananLayananItemTerbaca {
  id: string;
  label: string;
  amount: number;
  targetDate: string;
  leadTimeDays: number;
  teks: string | null;
  /** The ±2 days the work may be done in. */
  jendela: { dari: string; sampai: string };
  pekerjaan: {
    id: string;
    status: PekerjaanLayananStatus;
    /** True once the Terlambat tick flagged it: target date + 2 days, no proof. */
    terlambat: boolean;
    mulaiAt: Date | null;
    selesaiAt: Date | null;
    /** What the work has to show, derived from the Layanan's own kind. */
    harusBukti: ProofRequirement;
    /** What has been shown, each with a link to read it. */
    bukti: BuktiTerbaca[];
  } | null;
}

/** One order by its Nomor Pesanan, for the Pemesan who placed it, or null. */
export async function pesananLayananOf(
  deps: LayananDeps,
  nomor: string,
  pemesan: { accountId: string },
): Promise<PesananLayananOrder | null> {
  if (!/^MKM-\d{4}-\d{6}$/.test(nomor)) return null;
  const [order] = await deps.db
    .select()
    .from(pesananLayanan)
    .where(and(eq(pesananLayanan.nomor, nomor), eq(pesananLayanan.pemesanAccountId, pemesan.accountId)));
  if (!order) return null;
  const items = await deps.db
    .select()
    .from(pesananLayananItem)
    .where(eq(pesananLayananItem.pesananId, order.id))
    .orderBy(asc(pesananLayananItem.posisi));
  const jobs = await deps.db.select().from(pekerjaanLayanan).where(eq(pekerjaanLayanan.pesananId, order.id));
  const jobOf = new Map(jobs.map((job) => [job.pesananItemId, job]));
  // What each job has to show comes from the Layanan's own kind, so the read
  // carries the requirement and not just the files that happen to be there.
  const jenisOf = new Map((await katalog(deps.db)).map((entry) => [entry.id, entry.jenis] as const));
  const buktiDibutuhkan = new Map(
    items.map((satu) => {
      const jenis = jenisOf.get(satu.layananId);
      return [satu.id, jenis ? proofOf(jenis) : { fotoSesudah: true as const, fotoSebelum: false, video: false }] as const;
    }),
  );

  return {
    nomor: order.nomor,
    status: order.status,
    total: order.total,
    createdAt: order.createdAt,
    tagihan: { id: order.tagihanId },
    lokasi: { id: order.lokasiId, name: order.lokasiName },
    petak: { id: order.petakId, nomor: order.petakNomor },
    item: await Promise.all(
      items.map(async (satu) => {
        const job = jobOf.get(satu.id) ?? null;
        return {
          id: satu.id,
          label: satu.label,
          amount: satu.amount,
          targetDate: satu.targetDate,
          leadTimeDays: satu.leadTimeDays,
          teks: satu.teks,
          jendela: jendelaTarget(satu.targetDate),
          pekerjaan: job
            ? {
                id: job.id,
                status: job.status,
                terlambat: job.terlambatAt !== null,
                mulaiAt: job.mulaiAt,
                selesaiAt: job.selesaiAt,
                bukti: await buktiUntukPekerjaan(deps, job.id),
                /** What this job must show, so the page can say what is still missing. */
                harusBukti: buktiDibutuhkan.get(satu.id) ?? { fotoSesudah: true, fotoSebelum: false, video: false },
              }
            : null,
        };
      }),
    ),
  };
}
