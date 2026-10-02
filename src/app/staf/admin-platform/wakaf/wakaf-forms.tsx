"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ServerResult, idleFormState } from "../../form-feedback";
import {
  cocokkanNazhirPengajuan,
  hapusNazhirDaftar,
  pindahStatusPengajuan,
  tambahNazhirDaftar,
  tulisCatatanPengajuan,
  ubahNazhirDaftar,
} from "./actions";

const inputClass = "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const areaClass = "min-h-20 rounded-lg border border-input bg-background px-3 py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const labelClass = "flex flex-col gap-1 text-sm font-medium";

const JENIS = [
  { value: "perorangan", label: "Perorangan" },
  { value: "organisasi", label: "Organisasi" },
  { value: "badan_hukum", label: "Badan hukum" },
];

/** Adds a Nazhir, or (given one) changes it. */
export function NazhirForm({ nazhir }: { nazhir?: { id: string; nama: string; jenis: string; kabKota: string; kontak: string; nomorBwi: string } }) {
  const [state, action, pending] = useActionState(nazhir ? ubahNazhirDaftar : tambahNazhirDaftar, idleFormState);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      {nazhir ? <input type="hidden" name="nazhirId" value={nazhir.id} /> : null}
      <label className={labelClass}>
        Nama
        <input name="nama" required maxLength={200} defaultValue={nazhir?.nama} className={inputClass} />
      </label>
      <label className={labelClass}>
        Jenis
        <select name="jenis" defaultValue={nazhir?.jenis ?? "organisasi"} className={inputClass}>
          {JENIS.map((jenis) => (
            <option key={jenis.value} value={jenis.value}>
              {jenis.label}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Kabupaten/kota
        <input name="kabKota" required maxLength={100} defaultValue={nazhir?.kabKota} className={inputClass} />
      </label>
      <label className={labelClass}>
        Kontak
        <input name="kontak" required maxLength={200} defaultValue={nazhir?.kontak} className={inputClass} />
      </label>
      <label className={labelClass}>
        Nomor BWI
        <input name="nomorBwi" required maxLength={100} defaultValue={nazhir?.nomorBwi} className={inputClass} />
      </label>
      <div className="flex items-end gap-3">
        <Button type="submit" disabled={pending}>
          {nazhir ? "Simpan" : "Tambah"}
        </Button>
        <ServerResult state={state} />
      </div>
    </form>
  );
}

/** Removes a Nazhir; Pengajuan that name it keep the name. */
export function HapusNazhirForm({ nazhirId }: { nazhirId: string }) {
  const [state, action, pending] = useActionState(hapusNazhirDaftar, idleFormState);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="nazhirId" value={nazhirId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        Hapus
      </Button>
      <ServerResult state={state} />
    </form>
  );
}

/** One manual status move, with the date, reason, Petugas Lapangan or AIW/certificate scan the status needs. */
export function PindahStatusForm({
  pengajuanId,
  pilihan,
  petugas,
}: {
  pengajuanId: string;
  pilihan: { value: string; label: string }[];
  petugas: { accountId: string; email: string }[];
}) {
  const [state, action, pending] = useActionState(pindahStatusPengajuan, idleFormState);
  if (pilihan.length === 0) return <p className="text-sm text-muted-foreground">Status ini sudah akhir; tidak ada yang bisa dipindahkan.</p>;
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="pengajuanId" value={pengajuanId} />
      <label className={labelClass}>
        Pindah ke
        <select name="status" required className={inputClass}>
          {pilihan.map((satu) => (
            <option key={satu.value} value={satu.value}>
              {satu.label}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Tanggal (survei atau ikrar)
        <input name="tanggal" type="date" className={inputClass} />
      </label>
      <label className={labelClass}>
        Petugas Lapangan (untuk Survei Dijadwalkan)
        <select name="petugasAccountId" defaultValue="" className={inputClass}>
          <option value="">Belum dipilih</option>
          {petugas.map((satu) => (
            <option key={satu.accountId} value={satu.accountId}>
              {satu.email}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Scan AIW atau sertipikat (untuk Selesai)
        <input name="hasil" type="file" accept="application/pdf,image/jpeg,image/png" className="text-sm" />
      </label>
      <label className={`${labelClass} sm:col-span-2`}>
        Alasan (untuk Ditolak atau Dirujuk; dibaca Wakif)
        <textarea name="alasan" maxLength={1000} className={areaClass} />
      </label>
      <label className={`${labelClass} sm:col-span-2`}>
        Catatan untuk Wakif (ikut dikirim bersama perubahan)
        <textarea name="catatanWakif" maxLength={2000} className={areaClass} />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          Pindahkan
        </Button>
        <ServerResult state={state} />
      </div>
    </form>
  );
}

/** A note: to the Wakif (they read it in their Wakaf tab) or internal (only Admin Platform). */
export function CatatanForm({ pengajuanId }: { pengajuanId: string }) {
  const [state, action, pending] = useActionState(tulisCatatanPengajuan, idleFormState);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="pengajuanId" value={pengajuanId} />
      <label className={labelClass}>
        Untuk
        <select name="jenis" defaultValue="internal" className={inputClass}>
          <option value="internal">Catatan internal (Wakif tidak melihat)</option>
          <option value="wakif">Catatan untuk Wakif</option>
        </select>
      </label>
      <label className={labelClass}>
        Isi
        <textarea name="isi" required maxLength={2000} className={areaClass} />
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          Simpan catatan
        </Button>
        <ServerResult state={state} />
      </div>
    </form>
  );
}

/** Matches the Pengajuan to a Nazhir on the list. */
export function CocokkanNazhirForm({ pengajuanId, nazhir, terpilih }: { pengajuanId: string; nazhir: { id: string; nama: string }[]; terpilih: string | null }) {
  const [state, action, pending] = useActionState(cocokkanNazhirPengajuan, idleFormState);
  if (nazhir.length === 0) return <p className="text-sm text-muted-foreground">Belum ada Nazhir di daftar.</p>;
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="pengajuanId" value={pengajuanId} />
      <label className={labelClass}>
        Nazhir
        <select name="nazhirId" defaultValue={terpilih ?? nazhir[0]!.id} className={inputClass}>
          {nazhir.map((satu) => (
            <option key={satu.id} value={satu.id}>
              {satu.nama}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={pending}>
        Cocokkan
      </Button>
      <ServerResult state={state} />
    </form>
  );
}
