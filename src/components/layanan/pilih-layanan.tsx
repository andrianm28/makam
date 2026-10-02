"use client";

import { Input } from "@/components/ui/input";
import type { OpsiLayananView, PilihanLayanan, PilihanPerLayanan } from "@/lib/layanan-pilihan";
import { formatRupiah } from "@/lib/rupiah";

const kosong: PilihanLayanan = { varianId: "", teks: "", targetDate: "" };

/**
 * The picker of one booking checkout's Layanan: a variant per Layanan (or "Tidak dipesan"), the text it asks
 * for and, where the family chooses the day, a date no earlier than `tanggalPalingDini(Layanan)`.
 */
export function PilihLayanan({
  idAwalan,
  opsi,
  nilai,
  onChange,
  tanggalPalingDini,
}: {
  idAwalan: string;
  opsi: readonly OpsiLayananView[];
  nilai: PilihanPerLayanan;
  onChange: (berikutnya: PilihanPerLayanan) => void;
  /** Set where the family picks each Layanan's day; absent for hari-H, whose day is the burial's. */
  tanggalPalingDini?: (grup: OpsiLayananView) => string;
}) {
  const ubah = (id: string, bagian: Partial<PilihanLayanan>) => onChange({ ...nilai, [id]: { ...(nilai[id] ?? kosong), ...bagian } });
  return (
    <>
      {opsi.map((grup) => {
        const pilihan = nilai[grup.id] ?? kosong;
        return (
          <div key={grup.id} className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-body font-medium text-foreground" htmlFor={`${idAwalan}-${grup.id}`}>
              {grup.name}
              <select
                id={`${idAwalan}-${grup.id}`}
                value={pilihan.varianId}
                onChange={(event) => ubah(grup.id, { varianId: event.target.value })}
                className="h-11 rounded-lg border border-input bg-background px-3"
              >
                <option value="">Tidak dipesan</option>
                {grup.varian.map((varian) => (
                  <option key={varian.id} value={varian.id}>
                    {varian.name} — {formatRupiah(varian.harga)}
                  </option>
                ))}
              </select>
            </label>
            {grup.teksLabel && pilihan.varianId ? (
              <label className="flex flex-col gap-1 text-body font-medium text-foreground" htmlFor={`${idAwalan}-teks-${grup.id}`}>
                {grup.teksLabel}
                <Input id={`${idAwalan}-teks-${grup.id}`} value={pilihan.teks} onChange={(event) => ubah(grup.id, { teks: event.target.value })} className="h-11" />
              </label>
            ) : null}
            {tanggalPalingDini && pilihan.varianId ? (
              <label className="flex flex-col gap-1 text-body font-medium text-foreground" htmlFor={`${idAwalan}-tanggal-${grup.id}`}>
                Tanggal pengerjaan (paling cepat {tanggalPalingDini(grup)})
                <Input
                  id={`${idAwalan}-tanggal-${grup.id}`}
                  type="date"
                  min={tanggalPalingDini(grup)}
                  value={pilihan.targetDate}
                  onChange={(event) => ubah(grup.id, { targetDate: event.target.value })}
                  className="h-11"
                />
              </label>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
