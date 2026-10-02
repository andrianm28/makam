"use client";

import { useState } from "react";
import { PilihLayanan } from "@/components/layanan/pilih-layanan";
import { itemDariPilihan, subtotalPilihan, type OpsiLayananView, type PilihanPerLayanan } from "@/lib/layanan-pilihan";
import { formatRupiah } from "@/lib/rupiah";

export type OpsiTambahLayanan = OpsiLayananView & { tanggalPalingDini: string };

/**
 * The optional "Tambah Layanan" step of a Perpanjangan (ticket 53): the Lokasi's Layanan for this grave, each
 * with a date no earlier than its lead time after the Tagihan's due date, and a sticky bar with what they add.
 * The chosen items travel in the form as one JSON field the Server Action validates with Zod.
 */
export function TambahLayananPerpanjangan({ opsi }: { opsi: readonly OpsiTambahLayanan[] }) {
  const [pilihan, setPilihan] = useState<PilihanPerLayanan>({});
  if (opsi.length === 0) return null;
  const item = itemDariPilihan(opsi, pilihan, "perpanjangan");
  const tambahan = subtotalPilihan(opsi, pilihan);
  return (
    <>
      <fieldset className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
        <legend className="text-sm font-medium">Tambah Layanan (boleh dikosongkan)</legend>
        <p className="text-small text-muted-foreground">
          Ditagihkan pada Tagihan Perpanjangan yang sama; jatuh tempo tetap 3 x 24 jam. Pekerjaan dijadwalkan setelah Tagihan dibayar.
        </p>
        <PilihLayanan
          idAwalan="tambah-layanan"
          opsi={opsi}
          nilai={pilihan}
          onChange={setPilihan}
          tanggalPalingDini={(grup) => opsi.find((satu) => satu.id === grup.id)?.tanggalPalingDini ?? ""}
        />
        <input type="hidden" name="layananJson" value={JSON.stringify(item)} />
      </fieldset>
      {tambahan > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card shadow-sticky" data-testid="total-layanan">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <span className="text-caption text-muted-foreground">Layanan ditambahkan ke Tagihan</span>
            <span className="text-title-3 tabular-nums text-foreground">{formatRupiah(tambahan)}</span>
          </div>
        </div>
      ) : null}
    </>
  );
}
