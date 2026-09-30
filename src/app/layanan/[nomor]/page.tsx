import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { StatusBadge } from "@/components/makam/status-badge";
import { buttonVariants } from "@/components/ui/button";
import type { PesananLayananOrder } from "@/domain/layanan";
import { buktiPekerjaanLabels, keluhanPenjelasanPemesan, keluhanStatusLabels, labelBuktiPekerjaan, pesananLayananLabels } from "@/lib/layanan-labels";
import { documentPagePath } from "@/lib/document-links";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggal, formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";
import { BatalkanPekerjaan } from "./batalkan";
import { PekerjaanTpuDaftar } from "./pekerjaan-tpu";
import { AjukanKeluhan, BeriPenilaian } from "./keluhan";

const nomorSchema = z.string().trim().regex(/^MKM-\d{4}-\d{6}$/);

export async function generateMetadata({ params }: PageProps<"/layanan/[nomor]">): Promise<Metadata> {
  const parsed = nomorSchema.safeParse((await params).nomor);
  return {
    title: parsed.success ? `Layanan ${parsed.data} · Makam.co.id` : "Layanan tidak ditemukan · Makam.co.id",
    // An order is one family's business: never indexed, never followed.
    robots: { index: false, follow: false },
  };
}

/**
 * One order Layanan on its Nomor Pemesanan (spec, Layanan > Order; story 91): each
 * job with its own status, the ±2-day window it may be done in, the proof the
 * Admin Lokasi captured, and the cancel control while there is still time.
 *
 * Only the Pemesan who placed it may read it, through the module's own
 * `pesananLayananOf(nomor, pemesan)`.
 */
export default async function OrderLayananPage({ params }: PageProps<"/layanan/[nomor]">) {
  const actor = await currentActor();
  if (!actor) notFound();
  const nomor = (await params).nomor;
  const order = await serverRuntime().layanan.pesananLayananOf(nomor, { accountId: actor.accountId });
  // Not an order at a Lokasi Mitra: it may be an order at a DKI TPU, whose grave the family described (ticket 56).
  if (!order) return <PesananTpuPage nomor={nomor} accountId={actor.accountId} />;
  const tagihan = await serverRuntime().billing.tagihan(order.tagihan?.id ?? "");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-(--page-gutter) py-10">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-title-1 font-semibold tracking-tight text-balance">Layanan dipesan</h1>
        <p className="text-body-lg text-muted-foreground">
          Nomor Pesanan <span className="font-mono font-semibold text-foreground">{order.nomor}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-6 items-center rounded-md bg-info-soft px-2 text-caption font-medium text-info-soft-foreground">
            {pesananLayananLabels[order.status]}
          </span>
          <span className="text-small text-muted-foreground">Dipesan {formatTanggalJam(order.createdAt)}</span>
        </div>
        <p className="text-body text-muted-foreground">
          {order.lokasi.name} · Petak {order.petak.nomor}
        </p>
      </header>

      {tagihan ? (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-body font-semibold">Tagihan</h2>
          <p className="text-body text-muted-foreground">
            {tagihan.nomorTagihan} · {formatRupiah(tagihan.total)}
          </p>
          <p className="text-body text-muted-foreground">
            {tagihan.status === "lunas" ? "Sudah dibayar. Bukti pembayaran ada di halaman Tagihan." : `Jatuh tempo ${formatTanggalJam(tagihan.dueAt)}.`}
          </p>
          <a href={documentPagePath(tagihan.link)} className={buttonVariants({ variant: "outline" })}>
            Buka Tagihan
          </a>
        </section>
      ) : null}

      <ul className="flex flex-col gap-4">
        {order.item.map((satu) => (
          <li key={satu.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-body font-semibold">{satu.label}</h2>
              <span className="text-body font-medium">{formatRupiah(satu.amount)}</span>
            </div>
            {satu.teks ? <p className="mt-1 text-body text-muted-foreground">&ldquo;{satu.teks}&rdquo;</p> : null}
            <p className="mt-1 text-body text-muted-foreground">
              Target {formatTanggal(satu.targetDate)} · boleh dikerjakan {formatTanggal(satu.jendela.dari)} sampai {formatTanggal(satu.jendela.sampai)}
            </p>
            {satu.pekerjaan ? <Pekerjaan satu={satu} nomor={order.nomor} /> : null}
          </li>
        ))}
      </ul>
    </main>
  );
}

/** One job: its status, its proof, and the cancel control while there is still time. */
function Pekerjaan({ satu, nomor }: { satu: PesananLayananOrder["item"][number]; nomor: string }) {
  const kerja = satu.pekerjaan;
  if (!kerja) return null;
  const bisaBatal = kerja.status === "dijadwalkan" || kerja.status === "terlambat";
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={kerja.status} />
        {kerja.terlambat && kerja.status !== "terlambat" ? <span className="text-small text-destructive">Pernah terlambat</span> : null}
        {kerja.mulaiAt ? <span className="text-small text-muted-foreground">Dimulai {formatTanggalJam(kerja.mulaiAt)}</span> : null}
        {kerja.selesaiAt ? <span className="text-small text-muted-foreground">Selesai {formatTanggalJam(kerja.selesaiAt)}</span> : null}
      </div>

      <p className="text-small text-muted-foreground">
        Bukti: {["fotoSebelum", "fotoSesudah", "video"]
          .filter((kunci) => kerja.harusBukti[kunci as "fotoSebelum" | "fotoSesudah" | "video"])
          .map((kunci) => labelBuktiPekerjaan(kunci as keyof typeof buktiPekerjaanLabels))
          .join(", ")}
      </p>
      {kerja.bukti.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {kerja.bukti.map((satu2) => (
            <li key={satu2.kind}>
              {satu2.url ? (
                <a href={satu2.url} target="_blank" rel="noopener" className="text-body font-medium text-brand underline underline-offset-4">
                  {labelBuktiPekerjaan(satu2.kind)}
                </a>
              ) : (
                <span className="text-body text-muted-foreground">{labelBuktiPekerjaan(satu2.kind)} (belum bisa dibuka)</span>
              )}
              <span className="ml-1 text-small text-muted-foreground">{formatTanggalJam(satu2.takenAt)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {kerja.keluhan ? (
        <div className="flex flex-col gap-1 rounded-lg bg-warning-soft p-3">
          <p className="text-body font-semibold">Keluhan: {keluhanStatusLabels[kerja.keluhan.status]}</p>
          <p className="text-small text-muted-foreground">Diajukan {formatTanggalJam(kerja.keluhan.diajukanAt)}: &ldquo;{kerja.keluhan.alasan}&rdquo;</p>
          <p className="text-small text-muted-foreground">{keluhanPenjelasanPemesan[kerja.keluhan.status]}</p>
        </div>
      ) : null}
      {kerja.bolehKeluhan && kerja.jendelaKeluhanBerakhirAt ? (
        <AjukanKeluhan pekerjaanId={kerja.id} nomor={nomor} berakhirPada={formatTanggalJam(kerja.jendelaKeluhanBerakhirAt)} />
      ) : null}
      {kerja.bolehDinilai ? <BeriPenilaian pekerjaanId={kerja.id} nomor={nomor} /> : null}
      {kerja.dinilai ? <p className="text-small text-muted-foreground">Terima kasih, Anda sudah menilai pekerjaan ini.</p> : null}

      {bisaBatal ? <BatalkanPekerjaan pekerjaanId={kerja.id} nomor={nomor} /> : null}
    </div>
  );
}

/** An order Layanan at a DKI TPU: the grave as described, each job with its status, and the Mitra Jasa's first name and photo once accepted. */
async function PesananTpuPage({ nomor, accountId }: { nomor: string; accountId: string }) {
  const order = await serverRuntime().layanan.pesananTpuOf(nomor, { accountId });
  if (!order) notFound();
  const tagihan = await serverRuntime().billing.tagihanBerlaku(order.tagihanId);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-(--page-gutter) py-10">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-title-1 font-semibold tracking-tight text-balance">Layanan dipesan</h1>
        <p className="text-body-lg text-muted-foreground">
          Nomor Pesanan <span className="font-mono font-semibold text-foreground">{order.nomor}</span>
        </p>
        <p className="text-body text-muted-foreground">
          {order.tpu.name} · Makam {order.makam.blokNomor} · Almarhum {order.makam.almarhumName}
        </p>
      </header>

      {tagihan ? (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-body font-semibold">Tagihan</h2>
          <p className="text-body text-muted-foreground">
            {tagihan.nomorTagihan} · {formatRupiah(tagihan.total)}
          </p>
          <p className="text-body text-muted-foreground">
            {tagihan.status === "lunas" ? "Sudah dibayar. Bukti pembayaran ada di halaman Tagihan." : `Jatuh tempo ${formatTanggalJam(tagihan.dueAt)}.`}
          </p>
          <a href={documentPagePath(tagihan.link)} className={buttonVariants({ variant: "outline" })}>
            Buka Tagihan
          </a>
        </section>
      ) : null}

      <PekerjaanTpuDaftar order={order} />
    </main>
  );
}
