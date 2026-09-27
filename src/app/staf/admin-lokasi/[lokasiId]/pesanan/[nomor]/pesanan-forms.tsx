"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TersediaUnit } from "@/domain/inventory";
import { formatRupiah } from "@/lib/rupiah";
import { catatPembayaranLangsung, centangDokumen, konfirmasiPesanan, type PesananActionState } from "./actions";

const idle: PesananActionState = { status: "idle" };

/**
 * The confirmation itself (spec, story 117): one cleared Tersedia Petak of the
 * order's own Jenis Makam, and the burial the Lokasi agrees with the family. The
 * Hak Pakai and the pay-after Tagihan follow from this one step.
 */
export function KonfirmasiForm({
  lokasiId,
  nomor,
  petak,
  pemakamanAwal,
}: {
  lokasiId: string;
  nomor: string;
  petak: TersediaUnit[];
  /** The family's plan, as `datetime-local` holds it; the Lokasi may change the day. */
  pemakamanAwal: string;
}) {
  const [state, action, pending] = useActionState(konfirmasiPesanan, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="nomor" value={nomor} />
      <div className="flex flex-col gap-2">
        <label htmlFor="petakId" className="text-sm font-medium">Petak Makam</label>
        <Select name="petakId" defaultValue={petak[0]?.petakId}>
          <SelectTrigger id="petakId">
            <SelectValue placeholder="Pilih petak" />
          </SelectTrigger>
          <SelectContent>
            {petak.map((unit) => (
              <SelectItem key={unit.petakId} value={unit.petakId}>
                {unit.nomor} (Blok {unit.blok})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-small text-muted-foreground">
          Hanya petak yang sudah dicek dan masih kosong dari jenis makam yang dipesan.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="pemakamanAt" className="text-sm font-medium">Pemakaman</label>
        <Input id="pemakamanAt" name="pemakamanAt" type="datetime-local" defaultValue={pemakamanAwal} required />
        <p className="text-small text-muted-foreground">Tanggal jam pemakaman, sesuai zona waktu lokasi.</p>
      </div>
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" disabled={pending || petak.length === 0}>
          {pending ? "Mengonfirmasi…" : "Konfirmasi pesanan"}
        </Button>
        {petak.length === 0 ? (
          <p className="text-small text-danger-soft-foreground">
            Tidak ada petak kosong dari jenis makam ini. Bersihkan petak di Denah lebih dulu, atau tawarkan alternatif.
          </p>
        ) : null}
        {state.status !== "idle" ? (
          <p role={state.status === "gagal" ? "alert" : "status"} className="text-caption text-muted-foreground">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

/** One tick per checklist item (spec, story 120): what the family brought, ticked off. */
export function CentangDokumenForm({ lokasiId, nomor, nama, sudah }: { lokasiId: string; nomor: string; nama: string; sudah: boolean }) {
  const [state, action, pending] = useActionState(centangDokumen, idle);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="nomor" value={nomor} />
      <input type="hidden" name="nama" value={nama} />
      <Button type="submit" variant={sudah ? "outline" : "secondary"} size="sm" disabled={pending || sudah}>
        {sudah ? "Sudah ada" : "Tandai sudah ada"}
      </Button>
      {state.status !== "idle" ? (
        <span role={state.status === "gagal" ? "alert" : "status"} className="text-caption text-muted-foreground">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

/**
 * Catat Pembayaran Langsung (spec, Billing > Payment: "'Dibayar langsung ke
 * Lokasi Mitra' by the Admin Lokasi with proof"): the family paid this Lokasi
 * Mitra at its own gate, so the money never reached the Operator. Only that
 * Lokasi Mitra's own Admin Lokasi may record it, and only Admin Platform may
 * reverse it (a refund, which is its own step). The record of the cash is
 * required: without it nothing is written.
 */
export function BayarLangsungForm({
  lokasiId,
  nomor,
  namaLokasi,
  total,
  sudah,
}: {
  lokasiId: string;
  nomor: string;
  namaLokasi: string;
  total: number;
  sudah: boolean;
}) {
  const [state, action, pending] = useActionState(catatPembayaranLangsung, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="nomor" value={nomor} />
      <div className="flex flex-col gap-2">
        <label htmlFor="buktiLangsung" className="text-sm font-medium">
          Bukti pembayaran diterima
        </label>
        <Input id="buktiLangsung" name="bukti" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required />
        <p className="text-small text-muted-foreground">
          Foto nota atau bukti transfer yang keluarga serahkan ke {namaLokasi}, atau PDF-nya (paling besar 10 MB). Berkasnya disimpan di
          penyimpanan privat.
        </p>
      </div>
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" disabled={pending || sudah}>
          {pending ? "Mencatat…" : `Catat pembayaran langsung ${formatRupiah(total)}`}
        </Button>
        {sudah ? (
          <p className="text-small text-muted-foreground">
            Pembayaran langsung untuk pesanan ini sudah tercatat. Pembatalannya hanya dapat diproses Admin Platform.
          </p>
        ) : null}
        {state.status !== "idle" ? (
          <p role={state.status === "gagal" ? "alert" : "status"} className="text-caption text-muted-foreground">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
