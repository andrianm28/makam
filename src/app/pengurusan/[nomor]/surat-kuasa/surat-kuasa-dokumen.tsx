import { formatTanggal } from "@/lib/time/jakarta";
import type { SuratKuasa } from "@/domain/pengurusan";

/** The Surat Kuasa the Pemegang Hak signs: the print page and the page the PdfRenderer opens show the same text. */
export function SuratKuasaDokumen({ surat }: { surat: SuratKuasa }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 bg-white px-8 py-10 text-black print:p-0">
      <style>{"@page { size: A4; margin: 20mm; }"}</style>
      <h1 className="text-center text-title-2 font-semibold uppercase">Surat Kuasa</h1>
      <p>Yang bertanda tangan di bawah ini:</p>
      <dl className="flex flex-col gap-1">
        <Baris label="Nama" value={surat.pemberiKuasa.name} />
        {surat.pemberiKuasa.phoneNumber ? <Baris label="Telepon" value={surat.pemberiKuasa.phoneNumber} /> : null}
        {surat.pemberiKuasa.email ? <Baris label="Email" value={surat.pemberiKuasa.email} /> : null}
        <Baris label="Sebagai" value="Pemegang Hak makam" />
      </dl>
      <p>memberi kuasa kepada:</p>
      <dl className="flex flex-col gap-1">
        <Baris label="Perusahaan" value={surat.penerimaKuasa.perusahaan} />
        <Baris label="Diwakili oleh" value={surat.penerimaKuasa.wakil.name} />
        {surat.penerimaKuasa.wakil.phoneNumber ? <Baris label="Telepon" value={surat.penerimaKuasa.wakil.phoneNumber} /> : null}
      </dl>
      <p>
        untuk mengurus dan mengajukan Izin Penggunaan Tanah Makam (IPTM) atas makam almarhum/almarhumah{" "}
        <strong>{surat.almarhum.name}</strong> (wafat {formatTanggal(surat.almarhum.tanggalWafat)}) di {surat.tpu.name}, {surat.tpu.address}
        {surat.blokNomor ? `, ${surat.blokNomor}` : ""}, termasuk menyerahkan berkas dan menerima izin yang diterbitkan.
      </p>
      <p>Nomor Pemesanan {surat.nomor}.</p>
      <div className="mt-8 flex justify-between">
        <div className="flex flex-col gap-16">
          <span>Penerima Kuasa</span>
          <span className="font-medium">{surat.penerimaKuasa.wakil.name}</span>
        </div>
        <div className="flex flex-col gap-16">
          <span>Jakarta, {formatTanggal(surat.tanggal)}. Pemberi Kuasa (materai)</span>
          <span className="font-medium">{surat.pemberiKuasa.name}</span>
        </div>
      </div>
    </main>
  );
}

function Baris({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-32 shrink-0">{label}</dt>
      <dd>: {value}</dd>
    </div>
  );
}
