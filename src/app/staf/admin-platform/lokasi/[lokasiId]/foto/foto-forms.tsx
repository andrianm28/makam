"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ServerResult, idleFormState } from "../../../../form-feedback";
import { hapusFotoGaleri, hapusGambarTipeKavling, simpanGambarTipeKavling, unggahFotoGaleri } from "./actions";

const labelClass = "flex flex-col gap-1 text-sm font-medium";
const inputClass = "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const ACCEPT = "image/jpeg,image/png,image/webp";
/** The longest caption; the domain refuses a longer one too (`KETERANGAN_FOTO_MAX`). */
const KETERANGAN_FOTO_MAX = 120;

export type OpsiKategori = { value: string; label: string };

function Pernyataan() {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name="tanpaMakam" value="ya" required className="mt-1 size-4" />
      <span>Gambar ini tidak menampilkan nisan, makam berjajar, atau area pemakaman, dan boleh tampil di halaman publik.</span>
    </label>
  );
}

/** Adds a Galeri Lokasi photo: facilities and landscape only. */
export function UnggahFotoForm({ lokasiId, kategori }: { lokasiId: string; kategori: OpsiKategori[] }) {
  const [state, action, pending] = useActionState(unggahFotoGaleri, idleFormState);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <label className={labelClass}>
        Foto
        <input className={inputClass} name="foto" type="file" accept={ACCEPT} required />
      </label>
      <label className={labelClass}>
        Yang ditampilkan
        <select className={inputClass} name="kategori" required defaultValue={kategori[0]?.value}>
          {kategori.map((opsi) => (
            <option key={opsi.value} value={opsi.value}>
              {opsi.label}
            </option>
          ))}
        </select>
      </label>
      <label className={`${labelClass} sm:col-span-2`}>
        Keterangan (juga teks alternatif)
        <input className={inputClass} name="keterangan" required maxLength={KETERANGAN_FOTO_MAX} placeholder="Contoh: Gerbang utama dari jalan raya" />
      </label>
      <div className="sm:col-span-2">
        <Pernyataan />
      </div>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending} className="self-start">
          Tambah foto
        </Button>
        <ServerResult state={state} />
      </div>
    </form>
  );
}

export function HapusFotoForm({ lokasiId, fotoId }: { lokasiId: string; fotoId: string }) {
  const [state, action, pending] = useActionState(hapusFotoGaleri, idleFormState);
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="fotoId" value={fotoId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending} className="self-start">
        Hapus
      </Button>
      <ServerResult state={state} />
    </form>
  );
}

/** Sets or replaces a Jenis Makam's Gambar Tipe Kavling: an illustration or plan of its size. */
export function GambarTipeKavlingForm({ lokasiId, jenisMakamId, ada }: { lokasiId: string; jenisMakamId: string; ada: boolean }) {
  const [state, action, pending] = useActionState(simpanGambarTipeKavling, idleFormState);
  const [hapusState, hapus, menghapus] = useActionState(hapusGambarTipeKavling, idleFormState);
  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="lokasiId" value={lokasiId} />
        <input type="hidden" name="jenisMakamId" value={jenisMakamId} />
        <label className={labelClass}>
          Gambar (ilustrasi atau denah ukuran)
          <input className={inputClass} name="gambar" type="file" accept={ACCEPT} required />
        </label>
        <label className={labelClass}>
          Keterangan
          <input className={inputClass} name="keterangan" required maxLength={KETERANGAN_FOTO_MAX} placeholder="Contoh: Ilustrasi kavling 1 × 2 m" />
        </label>
        <div className="sm:col-span-2">
          <Pernyataan />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Button type="submit" disabled={pending} className="self-start">
            {ada ? "Ganti gambar" : "Simpan gambar"}
          </Button>
          <ServerResult state={state} />
        </div>
      </form>
      {ada ? (
        <form action={hapus} className="flex flex-col gap-1">
          <input type="hidden" name="lokasiId" value={lokasiId} />
          <input type="hidden" name="jenisMakamId" value={jenisMakamId} />
          <Button type="submit" variant="outline" size="sm" disabled={menghapus} className="self-start">
            Hapus gambar
          </Button>
          <ServerResult state={hapusState} />
        </form>
      ) : null}
    </div>
  );
}
