/** The Wakif's side of filing: the one-page Pengajuan Wakaf, its optional documents, the automatic Dirujuk. */
import { randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { normalisePhoneNumber } from "@/domain/identity";
import { addWorkingDays } from "@/domain/lokasi";
import { addWibDays, yearInJakarta } from "@/lib/time/jakarta";
import { hapusBerkasWakaf, simpanBerkasWakaf } from "./berkas";
import type { WakafDeps } from "./deps";
import { catatPerubahanStatus } from "./riwayat";
import { wakafNazhir, wakafPengajuan, type StatusWakaf } from "./schema";
import { ajukanWakafSchema, didalamJabodetabek, KONTAK_PERTAMA_HARI_KERJA, PETUNJUK_DIRUJUK } from "./skema";

/** Who files: the Akun behind the session (its Email Terverifikasi is where every status change goes). */
export interface Wakif {
  accountId: string;
  email: string;
}

export type AjukanWakafResult =
  | { ok: true; pengajuanId: string; nomor: string; status: StatusWakaf }
  | { ok: false; reason: "input_tidak_valid" | "nomor_telepon_tidak_valid" | "nazhir_tidak_ditemukan" | "berkas_tidak_didukung" | "penyimpanan_belum_tersedia" };

async function nomorBaru(deps: WakafDeps, now: Date): Promise<string> {
  for (let coba = 0; coba < 10; coba++) {
    const nomor = `WKF-${yearInJakarta(now)}-${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;
    const [ada] = await deps.db.select({ id: wakafPengajuan.id }).from(wakafPengajuan).where(eq(wakafPengajuan.nomor, nomor));
    if (!ada) return nomor;
  }
  throw new Error("no free Nomor Pengajuan Wakaf after 10 tries");
}

export async function ajukanWakaf(deps: WakafDeps, wakif: Wakif, raw: unknown): Promise<AjukanWakafResult> {
  const parsed = ajukanWakafSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;
  const telepon = normalisePhoneNumber(input.wakifTelepon);
  if (!telepon.ok) return { ok: false, reason: "nomor_telepon_tidak_valid" };

  let nazhirId: string | null = null;
  let nazhirNama: string | null = input.nazhirNama || null;
  if (input.nazhirId) {
    const [nazhir] = await deps.db.select({ nama: wakafNazhir.nama }).from(wakafNazhir).where(eq(wakafNazhir.id, input.nazhirId));
    if (!nazhir) return { ok: false, reason: "nazhir_tidak_ditemukan" };
    nazhirId = input.nazhirId;
    nazhirNama = nazhir.nama;
  }

  const now = deps.clock.now();
  const id = randomUUID();
  const disimpan = await simpanBerkasWakaf(deps, id, input.berkas, "wakif", now);
  if (!disimpan.ok) return disimpan;

  const nomor = await nomorBaru(deps, now);
  const kalender = await deps.lokasi.adminPlatformCalendar();
  const tenggat = addWorkingDays(kalender, now, KONTAK_PERTAMA_HARI_KERJA);
  // Outside Jabodetabek it is closed as Dirujuk at once, with the pointer to the local KUA/BWI (spec, Wakaf).
  const status: StatusWakaf = didalamJabodetabek(input.kabKota) ? "diajukan" : "dirujuk";
  const alasan = status === "dirujuk" ? PETUNJUK_DIRUJUK : null;
  try {
    await deps.db.transaction(async (tx) => {
      await tx.insert(wakafPengajuan).values({
        id,
        nomor,
        wakifAccountId: wakif.accountId,
        wakifEmail: wakif.email,
        tujuan: input.tujuan,
        namaKeluarga: input.tujuan === "keluarga" ? input.namaKeluarga : null,
        wakifNama: input.wakifNama,
        wakifTelepon: telepon.phoneNumber,
        hubunganDenganTanah: input.hubunganDenganTanah,
        kabKota: input.kabKota,
        alamat: input.alamat,
        pinLat: input.pin?.lat ?? null,
        pinLng: input.pin?.lng ?? null,
        luasM2: input.luasM2,
        jenisBukti: input.jenisBukti,
        nazhirId,
        nazhirNama,
        status,
        alasan,
        tanggalSurvei: null,
        tanggalIkrar: null,
        tugasSurveiId: null,
        berkas: disimpan.berkas,
        diajukanPada: now,
        // Only an open Pengajuan waits for a first contact; a Dirujuk one is closed.
        tenggatPada: status !== "diajukan" ? null : tenggat.ok ? tenggat.at : addWibDays(now, KONTAK_PERTAMA_HARI_KERJA),
        diubahPada: now,
      });
      await catatPerubahanStatus(deps, tx, { id, nomor, wakifEmail: wakif.email }, status, { tanggal: null, alasan, catatan: null }, now);
    });
  } catch (error) {
    await hapusBerkasWakaf(deps, disimpan.berkas);
    throw error;
  }
  return { ok: true, pengajuanId: id, nomor, status };
}
