import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StatusBadge } from "@/components/makam/status-badge";
import { ThreadPekerjaan } from "@/components/makam/thread-pekerjaan";
import { authorize, lokasiMitraResource } from "@/domain/identity";
import { jendelaKerja } from "@/domain/layanan";
import { keluhanStatusLabels } from "@/lib/layanan-labels";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggal, formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";
import { LangkahPekerjaan } from "./langkah-pekerjaan";
import { kirimPesanLokasi } from "./actions";

export const metadata: Metadata = {
  title: "Pekerjaan Layanan | Makam.co.id",
  robots: { index: false, follow: false },
};

/**
 * One Pekerjaan Layanan, as the Admin Lokasi of that Lokasi Mitra does it (spec,
 * story 131): where the grave is, what the Layanan is and what the family asked
 * for, the ±2-day window it may be done in, and the three steps — **Mulai**,
 * **Ambil bukti** in the app, **Selesai** — in that order and no other.
 */
export default async function PekerjaanPage({ params }: PageProps<"/staf/admin-lokasi/[lokasiId]/pekerjaan/[pekerjaanId]">) {
  const { lokasiId, pekerjaanId } = await params;
  const actor = await currentActor();
  if (!actor || !authorize(actor, "layanan.lihat_staf", lokasiMitraResource(lokasiId)).allowed) notFound();

  const hasil = await serverRuntime().layanan.pekerjaanUntukStaf(actor, { pekerjaanId });
  if (!hasil.ok) notFound();
  const pekerjaan = hasil.pekerjaan;
  // A job of another Lokasi's is not this Admin Lokasi's to open: the Antrean row
  // is where they met it, and its own list is their list.
  if (pekerjaan.lokasi.id !== lokasiId) redirect(`/staf/admin-lokasi/${lokasiId}/antrean`);
  const jendela = jendelaKerja(pekerjaan.targetDate);
  const thread = await serverRuntime().layanan.pesanPekerjaanUntukStaf(actor, pekerjaanId);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-small text-muted-foreground">
          <Link href={`/staf/admin-lokasi/${lokasiId}/antrean`} className="font-medium text-brand underline underline-offset-4">
            Kembali ke Antrean
          </Link>
        </p>
        <h1 className="text-title-1 text-foreground">{pekerjaan.pesanan.label}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={pekerjaan.status} />
          <span className="text-small text-muted-foreground">Target {formatTanggal(pekerjaan.targetDate)}</span>
        </div>
      </header>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-body font-semibold">Yang harus dikerjakan</h2>
        <dl className="mt-2 flex flex-col gap-1 text-body">
          <Baris label="Lokasi Mitra" value={pekerjaan.lokasi.name} />
          <Baris label="Petak" value={pekerjaan.petak.nomor} />
          <Baris label="Harga" value={formatRupiah(pekerjaan.pesanan.amount)} />
          <Baris label="Pemesan" value={`${pekerjaan.pemesan.name} · ${pekerjaan.pemesan.phoneNumber}`} />
          <Baris label="Nomor Pesanan" value={pekerjaan.pesanan.nomor} mono />
        </dl>
        {pekerjaan.pesanan.teks ? (
          <p className="mt-3 rounded-lg bg-info-soft p-3 text-body text-info-soft-foreground">Catatan dari pemesan: &ldquo;{pekerjaan.pesanan.teks}&rdquo;</p>
        ) : null}
        <p className="mt-3 text-small text-muted-foreground">
          Boleh dikerjakan dari {formatTanggal(jendela.dari)} sampai {formatTanggal(jendela.sampai)}, dua hari sebelum atau dua hari setelah tanggal
          target. Lewat tanggal {formatTanggal(pekerjaan.batasTerlambat)} tanpa bukti, pekerjaan ini ditandai terlambat.
        </p>
      </section>

      {pekerjaan.keluhan ? (
        <section className="flex flex-col gap-1 rounded-lg border border-border bg-warning-soft p-4" aria-labelledby="keluhan-heading">
          <h2 id="keluhan-heading" className="text-body font-semibold">
            Keluhan dari pemesan: {keluhanStatusLabels[pekerjaan.keluhan.status]}
          </h2>
          <p className="text-body">
            Diajukan {formatTanggalJam(pekerjaan.keluhan.diajukanAt)}: &ldquo;{pekerjaan.keluhan.alasan}&rdquo;
          </p>
          {pekerjaan.keluhan.catatanKeputusan ? (
            <p className="text-body text-muted-foreground">Keputusan Admin Platform: {pekerjaan.keluhan.catatanKeputusan}</p>
          ) : null}
          {pekerjaan.keluhan.status === "kerjakan_ulang" ? (
            <p className="text-small text-muted-foreground">Kerjakan ulang pekerjaan ini, ambil bukti baru untuk setiap bagian, lalu tandai selesai.</p>
          ) : null}
          {pekerjaan.keluhan.status === "terbuka" ? (
            <p className="text-small text-muted-foreground">Admin Platform sedang memeriksa keluhan ini. Bukti yang sudah ada tidak diubah.</p>
          ) : null}
        </section>
      ) : null}

      <ThreadPekerjaan
        thread={{
          pekerjaanId,
          readOnly: thread?.ok ? thread.thread.readOnly : true,
          pesan: thread?.ok
            ? thread.thread.pesan.map((satu) => ({
                id: satu.id,
                pengirimNama: satu.pengirimNama,
                teks: satu.teks,
                waktu: formatTanggalJam(satu.createdAt),
                foto: satu.lampiran.map((lampiran) => lampiran.url),
              }))
            : [],
        }}
        kirim={kirimPesanLokasi}
        hidden={{ lokasiId, pekerjaanId }}
      />

      <LangkahPekerjaan lokasiId={lokasiId} pekerjaan={pekerjaan} />
    </main>
  );
}

function Baris({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono font-medium" : "font-medium"}>{value}</dd>
    </div>
  );
}
