import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { satuNilai } from "@/lib/search-param";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggal } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";
import { pesanPerpanjanganTpuAction } from "./actions";

export const metadata: Metadata = {
  title: "Perpanjang IPTM | Makam.co.id",
  robots: { index: false, follow: false },
};

const inputClass = "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const labelClass = "flex flex-col gap-1 text-sm font-medium";

/**
 * Perpanjangan TPU (spec, Pengurusan > Perpanjangan TPU; stories 79-83; ticket 48): the Pemegang Hak of a Makam TPU requests one 3-year IPTM
 * term from 3 months before the IPTM expires, giving the expiry date as the IPTM photo shows it. The documents are uploaded on the order page, and the
 * Tagihan comes only after Admin Platform has checked them.
 */
export default async function PerpanjangIptmPage({ params, searchParams }: PageProps<"/pesan-makam/perpanjang-iptm/[makamTpuId]">) {
  const { makamTpuId } = await params;
  const galat = satuNilai((await searchParams).galat);
  const actor = await currentActor();
  if (!actor) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-title-2 text-foreground">Perpanjang IPTM</h1>
        <p className="text-body">Masuk dengan email Anda dulu untuk memperpanjang IPTM makam Anda.</p>
        <Link href="/masuk" className="font-medium text-brand underline underline-offset-4">Masuk</Link>
      </div>
    );
  }
  const { pengurusan, tariffs, adapters } = serverRuntime();
  const makam = (await pengurusan.makamTpuSaya({ accountId: actor.accountId })).find((satu) => satu.id === makamTpuId);
  if (!makam) notFound();
  const harga = await tariffs.quote([{ kind: "biaya_pengurusan", pengurusan: "berkas" }, { kind: "retribusi_pemda", retribusi: "iptm" }], adapters.clock.now());
  return (
    <form action={pesanPerpanjanganTpuAction} className="flex flex-col gap-4">
      <input type="hidden" name="makamTpuId" value={makam.id} />
      <h1 className="text-title-2 text-foreground">Perpanjang IPTM</h1>
      <p className="text-body">
        Makam {makam.blokNomor} di {makam.tpu.name}. IPTM tercatat berlaku sampai {formatTanggal(makam.iptm.berlakuSampai)}. Perpanjangan satu masa 3 tahun bisa dipesan mulai 3 bulan sebelum IPTM berakhir.
        Anda mengunggah dokumen; setelah kami periksa, Tagihan{harga.ok ? ` ${formatRupiah(harga.total)}` : ""} terbit dan harus dibayar dalam 3×24 jam sebelum kami mengajukan.
      </p>
      <p className="text-small text-muted-foreground">IPTM baru biasanya terbit dalam 5 hari kerja setelah pembayaran.</p>
      {galat ? <p role="alert" className="text-sm text-destructive">{galat}</p> : null}
      <label className={labelClass}>Nama Anda<input name="pemesanName" required className={inputClass} /></label>
      <label className={labelClass}>Nomor telepon Anda<input name="phoneNumber" required inputMode="tel" className={inputClass} /></label>
      <p className="text-small text-muted-foreground">Email pesanan: {actor.email}</p>
      <label className={labelClass}>
        IPTM berlaku sampai (sesuai foto IPTM)
        <input name="berlakuSampai" type="date" required defaultValue={makam.iptm.berlakuSampai} className={inputClass} />
      </label>
      <Button type="submit" className="self-start">Pesan perpanjangan IPTM</Button>
    </form>
  );
}
