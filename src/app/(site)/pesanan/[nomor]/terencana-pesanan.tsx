import Link from "next/link";
import { Check } from "lucide-react";
import { StatusBadge } from "@/components/makam/status-badge";
import { buttonVariants } from "@/components/ui/button";
import type { PemesananTerencanaOrder } from "@/domain/pemesanan";
import { tagihanStatusText } from "@/lib/billing-labels";
import { documentPagePath } from "@/lib/document-links";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggalJam } from "@/lib/time/jakarta";
import { cn } from "@/lib/utils";
import { serverRuntime } from "@/server/runtime";
import { TarikTerencanaForm } from "./tarik-terencana-form";

/** The Terencana wizard's first step: where a declined, withdrawn or lapsed order sends the family to choose again. */
const LANGKAH_LOKASI = "/pesan-makam/terencana";

/**
 * One Pemesanan Terencana on its Nomor Pemesanan, for its own Pemesan (spec, Pemesanan >
 * Terencana; stories 46, 47, 49; ticket 37): the plots it holds, where it stands, and
 * what the family can do now. Diajukan waits for the Lokasi Mitra; Dikonfirmasi is the
 * payment hold, with the Tagihan to pay and the free withdrawal; Aktif holds the Bukti
 * Pemesanan; Ditolak, and Dibatalkan by a lapse or a withdrawal, send the family back to
 * the Lokasi step.
 */
export async function TerencanaPesanan({ order }: { order: PemesananTerencanaOrder }) {
  const { billing } = serverRuntime();
  const tagihan = order.tagihanId ? await billing.tagihan(order.tagihanId) : null;
  const bukti = order.buktiPemesananId ? await billing.buktiPemesananById(order.buktiPemesananId) : null;
  const langkah = [
    { status: "diajukan" as const, tercapai: true },
    { status: "dikonfirmasi" as const, tercapai: order.dikonfirmasiPada !== null },
    { status: "aktif" as const, tercapai: order.status === "aktif" },
  ];
  const berakhir = order.status === "ditolak" || order.status === "dibatalkan";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-title-1 text-foreground">Pesanan makam untuk nanti</h1>
        <p className="text-body-lg text-muted-foreground">
          Nomor Pemesanan{" "}
          <span className="font-mono font-semibold text-foreground" data-testid="nomor-pemesanan">
            {order.nomor}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2" data-testid="status-pesanan-tagihan">
          <StatusBadge status={order.status} />
          {tagihan ? (
            <span className="text-small text-muted-foreground">
              Tagihan{" "}
              <span className="font-medium text-foreground" data-testid="status-tagihan">
                {tagihanStatusText(tagihan.status)}
              </span>
            </span>
          ) : null}
          <span className="text-small text-muted-foreground">Diajukan {formatTanggalJam(order.diajukanAt)}</span>
        </div>
      </header>

      {order.status === "diajukan" ? (
        <p className="rounded-xl bg-info-soft px-4 py-3 text-body text-info-soft-foreground" data-testid="menunggu-konfirmasi">
          {order.konfirmasiDueAt ? (
            <>
              <span className="font-semibold">{order.lokasi.name}</span> mengonfirmasi paling lambat {formatTanggalJam(order.konfirmasiDueAt)}. Petak
              Anda sudah ditahan, dan belum ada yang perlu dibayar. Kabarnya datang ke email Anda.
            </>
          ) : (
            <>
              {order.lokasi.name} belum membuka jam operasionalnya. Petak Anda sudah ditahan, dan begitu Lokasi Mitra mengonfirmasi, Tagihannya terbit.
            </>
          )}
        </p>
      ) : null}

      {order.status === "dikonfirmasi" && tagihan && order.tahanSampai ? (
        <section className="flex flex-col gap-3" data-testid="terencana-dikonfirmasi">
          <h2 className="text-title-3 text-foreground">Bayar sebelum petak dilepas</h2>
          <p className="rounded-xl bg-warning-soft px-4 py-3 text-body text-warning-soft-foreground">
            {order.lokasi.name} sudah mengonfirmasi. Petak Anda ditahan sampai{" "}
            <span className="font-semibold">{formatTanggalJam(order.tahanSampai)}</span>. Kalau Tagihan belum dibayar sampai saat itu,
            pesanan dibatalkan dan petaknya dilepas.
          </p>
          <dl className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5 text-body">
            <Baris label="Tagihan" value={tagihan.nomorTagihan} />
            <Baris label="Total" value={formatRupiah(tagihan.total)} />
            <Baris label="Jatuh tempo" value={formatTanggalJam(tagihan.dueAt)} />
          </dl>
          <Link href={documentPagePath(tagihan.link)} className={cn(buttonVariants({ variant: "default" }), "self-start")} data-testid="bayar-terencana">
            Lihat dan bayar Tagihan
          </Link>
        </section>
      ) : null}

      {order.status === "aktif" && bukti ? (
        <section className="flex flex-col gap-3" data-testid="bukti-pemesanan">
          <h2 className="text-title-3 text-foreground">Bukti Pemesanan</h2>
          <p className="rounded-xl bg-success-soft px-4 py-3 text-body text-success-soft-foreground">
            Pembayaran sudah kami terima dan hak makamnya resmi. Simpan Bukti Pemesanan {bukti.nomor} sebagai bukti hak Anda.
            {order.masaPembatalanBerakhirPada
              ? ` Masa Pembatalan berakhir ${formatTanggalJam(order.masaPembatalanBerakhirPada)}.`
              : ""}
          </p>
          <div>
            <Link href={documentPagePath(bukti.link)} className={cn(buttonVariants({ variant: "outline" }), "inline-flex")}>
              Buka Bukti Pemesanan
            </Link>
          </div>
        </section>
      ) : null}

      {berakhir ? (
        <section className="flex flex-col gap-3" data-testid="terencana-berakhir">
          <h2 className="text-title-3 text-foreground">{order.status === "ditolak" ? "Pesanan belum bisa dilayani" : "Pesanan dibatalkan"}</h2>
          <p className="rounded-xl bg-warning-soft px-4 py-3 text-body text-warning-soft-foreground">
            {order.status === "ditolak"
              ? `${order.lokasi.name} belum bisa melayani pesanan ini.`
              : "Pesanan ini dibatalkan dan petaknya sudah dilepas."}
            {order.alasan ? ` Alasannya: ${order.alasan}.` : ""} Tidak ada yang ditagih.
          </p>
          <Link href={LANGKAH_LOKASI} className={cn(buttonVariants({ variant: "default" }), "self-start")} data-testid="pilih-lokasi-lain">
            Pilih Lokasi Mitra lain
          </Link>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-title-3 text-foreground">Status pesanan</h2>
        <ol className="flex flex-col gap-2">
          {langkah.map((step) => (
            <li key={step.status} className="flex items-center gap-3 text-body">
              <span
                className={cn(
                  "inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                  step.tercapai ? "border-primary bg-primary text-primary-foreground" : "border-border-strong",
                )}
                aria-hidden
              >
                {step.tercapai ? <Check className="size-3.5" /> : null}
              </span>
              <span className={cn(step.tercapai ? "font-medium text-foreground" : "text-muted-foreground")}>
                {step.status === "diajukan" ? "Diajukan" : step.status === "dikonfirmasi" ? "Dikonfirmasi" : "Aktif"}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {order.status === "diajukan" || order.status === "dikonfirmasi" ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-title-3 text-foreground">Berubah pikiran?</h2>
          <p className="text-small text-muted-foreground">
            Sebelum Tagihan dibayar, Anda bisa membatalkan pesanan kapan saja. Petak dilepas dan tidak ada biaya apa pun.
          </p>
          <TarikTerencanaForm nomor={order.nomor} />
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-title-3 text-foreground">Yang dipesan</h2>
        <dl className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5 text-body">
          <Baris label="Lokasi Mitra" value={order.lokasi.name} href={`/lokasi/${order.lokasi.id}`} />
          <Baris label="Petak" value={order.unit.map((unit) => `${unit.nomor} (${unit.jenisMakamName})`).join(", ")} />
          <Baris label="Calon Penghuni" value={order.calonPenghuni.name ?? order.pemesan.name} />
          <Baris
            label="Pemegang Hak"
            value={
              order.pemegangHak.mode === "pemesan"
                ? `${order.pemegangHak.name} (Pemesan)`
                : `${order.pemegangHak.name}${order.pemegangHak.phoneNumber ? ` · ${order.pemegangHak.phoneNumber}` : ""}`
            }
          />
          <Baris label="Pemesan" value={`${order.pemesan.name} · ${order.pemesan.email}`} />
          <Baris label="Masa Pembatalan" value={`${order.syarat.masaPembatalanDays} hari setelah pembayaran`} />
          <Baris label="Pengembalian setelahnya" value={`${order.syarat.refundAfterMasaPembatalanPercent}% dari tarif`} />
        </dl>
      </section>

      <Link href="/akun" className={cn(buttonVariants({ variant: "outline" }), "self-start")}>
        Lihat pesanan saya di Akun Saya
      </Link>
    </main>
  );
}

function Baris({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">
        {href ? (
          <Link href={href} className="underline underline-offset-4">
            {value}
          </Link>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
