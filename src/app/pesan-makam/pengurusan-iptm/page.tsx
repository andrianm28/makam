import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { satuNilai } from "@/lib/search-param";
import { formatRupiah } from "@/lib/rupiah";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";
import { pesanPengurusanIptmAction } from "./actions";

export const metadata: Metadata = {
  title: "Sudah dimakamkan? Kami urus IPTM-nya | Makam.co.id",
  robots: { index: false, follow: false },
};

const inputClass = "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const labelClass = "flex flex-col gap-1 text-sm font-medium";

/**
 * "Sudah dimakamkan? Kami urus IPTM-nya" (spec, Pengurusan IPTM; ticket 47): a family that buried at a DKI TPU on its
 * own orders the filing only. The order starts Dimakamkan; the documents are uploaded on its order page within 7 days,
 * and the Tagihan comes only after Admin Platform has checked them.
 */
export default async function PengurusanIptmPage({ searchParams }: PageProps<"/pesan-makam/pengurusan-iptm">) {
  const galat = satuNilai((await searchParams).galat);
  const actor = await currentActor();
  if (!actor) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-title-2 text-foreground">Sudah dimakamkan? Kami urus IPTM-nya</h1>
        <p className="text-body">Masuk dengan email Anda dulu, lalu isi data pemakaman. Biaya baru ditagih setelah dokumen Anda kami periksa.</p>
        <Link href="/masuk" className="font-medium text-brand underline underline-offset-4">Masuk</Link>
      </div>
    );
  }
  const { lokasi, tariffs } = serverRuntime();
  const daftarTpu = await lokasi.publicTpuDkiList({});
  const harga = await tariffs.quote([{ kind: "biaya_pengurusan", pengurusan: "berkas" }, { kind: "retribusi_pemda", retribusi: "iptm" }], new Date());
  return (
    <form action={pesanPengurusanIptmAction} encType="multipart/form-data" className="flex flex-col gap-4">
      <h1 className="text-title-2 text-foreground">Sudah dimakamkan? Kami urus IPTM-nya</h1>
      <p className="text-body">
        Untuk keluarga yang sudah memakamkan almarhum di TPU DKI atas urusan sendiri. Anda mengunggah dokumen dalam 7 hari; setelah kami periksa,
        Tagihan{harga.ok ? ` ${formatRupiah(harga.total)}` : ""} terbit dan harus dibayar dalam 3×24 jam sebelum kami mengajukan IPTM.
      </p>
      {galat ? <p role="alert" className="text-sm text-destructive">{galat}</p> : null}
      <label className={labelClass}>TPU tempat almarhum dimakamkan
        <select name="tpuId" required defaultValue="" className={inputClass}>
          <option value="" disabled>Pilih TPU</option>
          {daftarTpu.map((tpu) => <option key={tpu.id} value={tpu.id}>{tpu.name}</option>)}
        </select>
      </label>
      <label className={labelClass}>Nama Anda<input name="pemesanName" required className={inputClass} /></label>
      <label className={labelClass}>Nomor telepon Anda<input name="phoneNumber" required inputMode="tel" className={inputClass} /></label>
      <p className="text-small text-muted-foreground">Email pesanan: {actor.email}</p>
      <label className={labelClass}>Nama almarhum<input name="almarhumName" required className={inputClass} /></label>
      <label className={labelClass}>Tanggal wafat<input name="tanggalWafat" type="date" required className={inputClass} /></label>
      <label className={labelClass}>Jenis makam
        <select name="jenis" defaultValue="baru" className={inputClass}>
          <option value="baru">Makam baru</option>
          <option value="tumpang">Tumpang (makam yang sudah berisi)</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ktpDki" defaultChecked /> KTP DKI</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="wafatDiJakarta" defaultChecked /> Almarhum meninggal di Jakarta</label>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Khusus tumpang</legend>
        <label className={labelClass}>Blok dan nomor makam<input name="blokNomor" className={inputClass} /></label>
        <label className={labelClass}>Nama almarhum yang sudah ada di makam itu<input name="namaKuburan" className={inputClass} /></label>
        <label className={labelClass}>Foto IPTM makam itu<input name="fotoIptm" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className={inputClass} /></label>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Pemegang Hak IPTM</legend>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="pemegangHakMode" value="pemesan" defaultChecked /> Saya sendiri</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="pemegangHakMode" value="lain" /> Anggota keluarga lain</label>
        <label className={labelClass}>Nama<input name="pemegangHakName" className={inputClass} /></label>
        <label className={labelClass}>Nomor telepon<input name="pemegangHakPhone" inputMode="tel" className={inputClass} /></label>
        <label className={labelClass}>Email (bila ada)<input name="pemegangHakEmail" type="email" className={inputClass} /></label>
      </fieldset>
      <Button type="submit" className="self-start">Pesan pengurusan IPTM</Button>
    </form>
  );
}
