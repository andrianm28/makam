import type { Database } from "@/db/client";
import type { Actor } from "@/domain/identity";
import type { Layanan } from "@/domain/layanan";
import type { HentikanResult, Lokasi } from "@/domain/lokasi";
import type { Notifications } from "@/domain/notifications";
import type { Pemesanan } from "@/domain/pemesanan";

/**
 * Admin Platform's Berhenti decision for a Lokasi Mitra, and the notice that follows it (ticket 59): the Lokasi
 * module records the decision (audited, with its effective date); each family with an order running there or a Paket
 * Layanan subscribed there is then emailed through Notifications. The Lokasi, Pemesanan and Layanan modules know
 * nothing of each other's notices, so the sequence is composed here. The decision and the notices commit in one
 * transaction: a notice that cannot be queued leaves the Lokasi as it was, so the decision can be taken again. A family
 * that cannot be emailed is skipped.
 */
export async function hentikanLokasiMitra(
  deps: {
    db: Database;
    lokasi: Pick<Lokasi, "hentikan" | "publicLokasiMitraTampil">;
    pemesanan: Pick<Pemesanan, "pesananBerjalanDiLokasi">;
    layanan: Pick<Layanan, "pelangganPaketDiLokasi">;
    notifications: Pick<Notifications, "lokasiBerhenti">;
  },
  by: Actor,
  lokasiId: string,
  input: { berlakuOn?: string; alasan?: string },
): Promise<HentikanResult> {
  const profil = await deps.lokasi.publicLokasiMitraTampil(lokasiId);
  const pesanan = await deps.pemesanan.pesananBerjalanDiLokasi(lokasiId);
  const paket = await deps.layanan.pelangganPaketDiLokasi(lokasiId);
  return deps.db.transaction(async (tx) => {
    const hasil = await deps.lokasi.hentikan(by, lokasiId, input, tx);
    if (!hasil.ok || !profil) return hasil;
    await deps.notifications.lokasiBerhenti(
      {
        lokasi: { id: lokasiId, name: profil.name },
        berlakuOn: hasil.berlakuOn,
        penerima: [...pesanan, ...paket].map((satu) => ({ kunci: satu.nomor, nomor: satu.nomor, email: satu.email })),
      },
      tx,
    );
    return hasil;
  });
}
