import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LandPlot } from "lucide-react";
import { EmptyState } from "@/components/makam/empty-state";
import { documentPagePath } from "@/lib/document-links";
import { kartuMakamSaya } from "@/lib/makam-keluarga-content";
import { formatTanggal } from "@/lib/time/jakarta";
import { currentActor } from "@/server/session";
import { serverRuntime } from "@/server/runtime";

export const metadata: Metadata = {
  title: "Makam Keluarga · Akun Saya | Makam.co.id",
  robots: { index: false, follow: false },
};

/**
 * Akun Saya's Makam tab (spec, story 101): every Hak Pakai whose recorded
 * Pemegang Hak email is this Akun's Email Terverifikasi — even one someone else
 * ordered — with its Lokasi, Petak / Kavling, status, end date, every Pemakaman
 * and its documents. "Ajukan Pembatalan" is here for a paid Terencana Hak Pakai that can still be given
 * back (ticket 38); Makam TPU items, active Paket and the other Pemegang Hak actions are this tab's
 * later extension points (tickets 46, 54, 39).
 */
export default async function AkunMakamPage() {
  const actor = await currentActor();
  if (!actor) redirect("/masuk");
  const { inventory, lokasi, pemesanan } = serverRuntime();

  const [unit, cards] = await Promise.all([inventory.makamKeluargaSaya({ email: actor.email }), lokasi.publicLokasiMitraList()]);
  const namaLokasi = new Map(cards.map((card) => [card.id, card.name]));
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
      );
    }),
  );

  if (kartu.length === 0) {
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
          {satu.tanggalBerakhir && satu.status.label !== "Berakhir" && satu.status.label !== "Dibatalkan" ? (
            <Link href={`/perpanjangan/${satu.hakPakaiId}`} className="text-small font-medium text-brand underline underline-offset-4">
              Perpanjang Makam
            </Link>
          ) : null}

          <PembatalanTautan hakPakaiId={satu.hakPakaiId} info={pembatalan.get(satu.hakPakaiId)} />

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
