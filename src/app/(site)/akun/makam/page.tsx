import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LandPlot } from "lucide-react";
import { EmptyState } from "@/components/makam/empty-state";
import { documentPagePath } from "@/lib/document-links";
import { kartuMakamSaya, type PengelolaLokasi } from "@/lib/makam-keluarga-content";
import { formatTanggal } from "@/lib/time/jakarta";
import { currentActor } from "@/server/session";
import { rilisTerbuka } from "@/lib/rilis";
import { serverRuntime } from "@/server/runtime";
import { CalonPenghuniForm } from "../../permintaan-hak-pakai/[hakPakaiId]/permintaan-forms";

export const metadata: Metadata = {
  title: "Makam Keluarga · Akun Saya | Makam.co.id",
  robots: { index: false, follow: false },
};

/**
 * Akun Saya's Makam tab (spec, story 101): every Hak Pakai whose recorded
 * Pemegang Hak email is this Akun's Email Terverifikasi — even one someone else
 * ordered — with its Lokasi, Petak / Kavling, status, end date, every Pemakaman
 * and its documents. "Ajukan Pembatalan" is here for a paid Terencana Hak Pakai that can still be given
 * back (ticket 38); Makam TPU cards (ticket 46: each links to Pesan Layanan prefilled with `?makam=<id>`), active Paket and the other Pemegang Hak actions are this tab's
 * later extension points (tickets 46, 54, 39).
 */
export default async function AkunMakamPage() {
  const actor = await currentActor();
  if (!actor) redirect("/masuk");
  const { inventory, lokasi, pemesanan, pengurusan } = serverRuntime();
  // Pengembalian, Ganti Pemegang Hak and the Calon Penghuni label open with Rilis 2 (ADR 0006).
  const permintaanTerbuka = rilisTerbuka("perpanjangan_lanjutan");
  const makamTpu = await pengurusan.makamTpuSaya({ accountId: actor.accountId });

  const [unit, cards] = await Promise.all([inventory.makamKeluargaSaya({ email: actor.email }), lokasi.publicLokasiMitraList()]);
  const namaLokasi = new Map(cards.map((card) => [card.id, card.name]));
  // A Lokasi that is Ditangguhkan or Berhenti is off the public list, but its Hak Pakai stays on this tab:
  // name it from the status-aware profile, and mark the ones whose Berhenti has taken effect read-only.
  const lokasiBerhenti = new Map<string, PengelolaLokasi>();
  for (const lokasiId of new Set(unit.map((satu) => satu.lokasiId))) {
    const profil = await lokasi.publicLokasiMitraTampil(lokasiId);
    if (profil && !namaLokasi.has(lokasiId)) namaLokasi.set(lokasiId, profil.name);
    if (profil && !(await lokasi.izinPesanan(lokasiId, "lanjutan")).diizinkan) {
      lokasiBerhenti.set(lokasiId, {
        pengelolaName: profil.pengelolaName,
        address: profil.address,
        telepon: profil.pengelolaTelepon,
        email: profil.pengelolaEmail,
      });
    }
  }
  // Which of them can be cancelled (or has a request open): the module decides, and says nothing for a Hak Pakai that is no Terencana order's.
  const pembatalan = new Map(
    await Promise.all(
      unit.map(async (satu) => [satu.hakPakaiId, await pemesanan.pratinjauPembatalanTerencana({ accountId: actor.accountId, email: actor.email }, satu.hakPakaiId)] as const),
    ),
  );
  const kartu = await Promise.all(
    unit.map(async (satu) => {
      const bukti = await pemesanan.buktiUntukHakPakai(satu.hakPakaiId);
      return kartuMakamSaya(
        satu,
        namaLokasi,
        bukti.map((satuBukti) => ({ nomor: satuBukti.nomor, href: documentPagePath(satuBukti.link) })),
        lokasiBerhenti,
      );
    }),
  );

  if (kartu.length === 0 && makamTpu.length === 0) {
    return (
      <EmptyState
        icon={LandPlot}
        title="Belum ada makam yang tercatat"
        description="Setiap Hak Pakai atau Makam TPU dengan email ini sebagai Pemegang Hak akan muncul di sini, walau dipesan orang lain."
        action={
          <Link href="/makam-keluarga" className="font-medium text-brand underline underline-offset-4">
            Cari makam keluarga
          </Link>
        }
      />
    );
  }

  return (
    <ul className="flex flex-col gap-4">
      {makamTpu.map((satu) => (
        <li key={satu.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" data-testid="kartu-makam-tpu">
          <div>
            <p className="font-medium text-foreground">
              {satu.tpu.name} · {satu.blokNomor}
            </p>
            <p className="text-small text-muted-foreground">Makam TPU · IPTM berlaku sampai {formatTanggal(satu.iptm.berlakuSampai)}</p>
          </div>
          <p className="text-small text-muted-foreground">{satu.almarhum.map((orang) => orang.name).join(", ")}</p>
          <Link href={`/layanan/tpu?makam=${satu.id}`} className="text-small font-medium text-brand underline underline-offset-4">
            Pesan Layanan
          </Link>
        </li>
      ))}
      {kartu.map((satu) => (
        <li key={satu.hakPakaiId} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium text-foreground">
                {satu.namaLokasi} · {satu.nomor}
              </p>
              <p className="text-small text-muted-foreground">
                {satu.status.label}
                {satu.tanggalBerakhir ? ` · berakhir ${formatTanggal(satu.tanggalBerakhir)}` : " · selamanya"}
              </p>
            </div>
            <Link href={satu.alamat} className="text-small font-medium text-brand underline underline-offset-4">
              Buka di Makam Keluarga
            </Link>
          </div>
          <p className="text-small text-muted-foreground">{satu.status.arti}</p>
          {satu.hanyaBaca ? (
            <p className="text-small text-muted-foreground">
              Kemitraan Lokasi ini sudah berakhir. Catatan dan dokumen tetap bisa dilihat di sini; Perpanjang Makam dan Layanan tidak lagi tersedia.
              {satu.pengelola
                ? ` Untuk hal lain, hubungi pengelola: ${[satu.pengelola.name, satu.pengelola.address, satu.pengelola.telepon, satu.pengelola.email].filter(Boolean).join(", ")}.`
                : ""}
            </p>
          ) : null}
          {!satu.hanyaBaca && satu.tanggalBerakhir && satu.status.label !== "Berakhir" && satu.status.label !== "Dibatalkan" ? (
            <Link href={`/perpanjangan/${satu.hakPakaiId}`} className="text-small font-medium text-brand underline underline-offset-4">
              Perpanjang Makam
            </Link>
          ) : null}

          {permintaanTerbuka && !satu.hanyaBaca && satu.status.key === "aktif" ? (
            <Link href={`/permintaan-hak-pakai/${satu.hakPakaiId}`} className="text-small font-medium text-brand underline underline-offset-4" data-testid="tautan-permintaan-hak-pakai">
              Kembalikan Hak Pakai atau Ajukan Ganti Pemegang Hak
            </Link>
          ) : null}
          {permintaanTerbuka && !satu.hanyaBaca && satu.status.key === "aktif" ? (
            <div className="flex flex-col gap-3">
              {(unit.find((makam) => makam.hakPakaiId === satu.hakPakaiId)?.petak ?? []).map((petak) => (
                <CalonPenghuniForm key={petak.petakId} hakPakaiId={satu.hakPakaiId} petakId={petak.petakId} nomor={petak.nomorMakam} label={petak.calonPenghuni} />
              ))}
            </div>
          ) : null}

          {satu.hanyaBaca ? null : <PembatalanTautan hakPakaiId={satu.hakPakaiId} info={pembatalan.get(satu.hakPakaiId)} />}

          {satu.pemakaman.length > 0 ? (
            <div>
              <p className="text-small font-medium text-foreground">Pemakaman</p>
              <ul className="flex flex-col gap-1">
                {satu.pemakaman.map((pemakaman, index) => (
                  <li key={`${pemakaman.almarhumName}-${pemakaman.date}-${index}`} className="text-small text-muted-foreground">
                    {pemakaman.almarhumName} · {formatTanggal(pemakaman.date)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {satu.dokumen.length > 0 ? (
            <div>
              <p className="text-small font-medium text-foreground">Dokumen</p>
              <ul className="flex flex-col gap-1">
                {satu.dokumen.map((dokumen) => (
                  <li key={dokumen.href}>
                    <Link href={dokumen.href} className="text-small font-medium text-brand underline underline-offset-4">
                      {dokumen.nomor}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * The way into a Pembatalan from a card: "Ajukan Pembatalan" while the module says it can be asked, and the
 * request's own page while one is open or has an answer to read. Nothing for a Hak Pakai that cannot be cancelled.
 */
function PembatalanTautan({
  hakPakaiId,
  info,
}: {
  hakPakaiId: string;
  info: Awaited<ReturnType<ReturnType<typeof serverRuntime>["pemesanan"]["pratinjauPembatalanTerencana"]>> | undefined;
}) {
  if (!info?.ok) return null;
  const { bisaMengajukan, permintaan } = info.pembatalan;
  const terbuka = permintaan !== null && (permintaan.status === "diajukan" || permintaan.status === "perlu_perbaikan");
  if (!bisaMengajukan.ok && !terbuka) return null;
  return (
    <Link href={`/pembatalan/${hakPakaiId}`} className="text-small font-medium text-brand underline underline-offset-4" data-testid="tautan-pembatalan">
      {terbuka ? "Lihat permintaan Pembatalan" : "Ajukan Pembatalan"}
    </Link>
  );
}
