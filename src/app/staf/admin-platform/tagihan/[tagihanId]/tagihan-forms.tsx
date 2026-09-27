"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRupiah } from "@/lib/rupiah";
import { ServerResult, idleFormState } from "../../../form-feedback";
import { catatPembayaranManual, tambahHargaKhusus } from "./actions";

/**
 * Catat Pembayaran Manual (spec, Billing > Payment: "Transfer manual / Tunai by
 * Admin Platform with proof"): the method, the time the money arrived (the
 * transfer's own time, as the slip shows it), and the slip itself. The proof is
 * not optional — the form cannot be submitted without one, and the module would
 * refuse it anyway.
 */
export function PembayaranManualForm({ tagihanId, total, bisaDibayar }: { tagihanId: string; total: number; bisaDibayar: boolean }) {
  const [state, action, pending] = useActionState(catatPembayaranManual, idleFormState);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="tagihanId" value={tagihanId} />
      <div className="flex flex-col gap-2">
        <label htmlFor="metode" className="text-body font-medium">Metode</label>
        <Select name="metode" defaultValue="transfer_manual">
          <SelectTrigger id="metode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="transfer_manual">Transfer manual</SelectItem>
            <SelectItem value="tunai">Tunai</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-small text-muted-foreground">
          Transfer ke rekening Operator, atau uang tunai di tempat. Pembayaran yang keluarga lakukan langsung ke Lokasi Mitra dicatat oleh Admin
          Lokasi di halaman pesanan, bukan di sini.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="referensi" className="text-body font-medium">Referensi transfer (opsional)</label>
        <Input id="referensi" name="referensi" maxLength={120} placeholder="Nomor bukti transfer" />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="dibayarPada" className="text-body font-medium">Waktu pembayaran (opsional)</label>
        <Input id="dibayarPada" name="dibayarPada" type="datetime-local" />
        <p className="text-small text-muted-foreground">Kosongkan berarti waktu pencatatan. Yang dicatat harus sebelum batas pembayaran Tagihan.</p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="bukti" className="text-body font-medium">Bukti pembayaran</label>
        <Input id="bukti" name="bukti" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required />
        <p className="text-small text-muted-foreground">Foto bukti transfer atau nota, atau PDF-nya. Paling besar 10 MB. Berkas ini tersimpan di penyimpanan
          privat dan hanya bisa dibaca Admin Platform.</p>
      </div>
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" disabled={pending || !bisaDibayar}>
          {pending ? "Mencatat…" : `Catat pembayaran ${formatRupiah(total)}`}
        </Button>
        {!bisaDibayar ? (
          <p className="text-small text-danger-soft-foreground">
            Tagihan ini sudah Lunas atau tidak bisa dibayar lagi, jadi pembayaran tidak bisa dicatat di sini.
          </p>
        ) : null}
        <ServerResult state={state} />
      </div>
    </form>
  );
}

/**
 * Harga Khusus (spec, Billing and Payouts): what comes off this Tagihan and why,
 * and what the Lokasi Mitra agreed to bear of it. Submitting replaces the
 * Tagihan with a new one carrying the reduction as its own negative line — an
 * issued Tagihan is never edited — and the due date does not move.
 */
export function HargaKhususForm({
  tagihanId,
  nomorPemesanan,
  lokasiId,
  total,
  partnerShare,
  bisaDiubah,
}: {
  tagihanId: string;
  nomorPemesanan: string | null;
  lokasiId: string;
  total: number;
  partnerShare: number;
  bisaDiubah: boolean;
}) {
  const [state, action, pending] = useActionState(tambahHargaKhusus, idleFormState);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="tagihanId" value={tagihanId} />
      <input type="hidden" name="nomorPemesanan" value={nomorPemesanan ?? ""} />
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="nomor" value={nomorPemesanan ?? ""} />
      <div className="flex flex-col gap-2">
        <label htmlFor="jumlah" className="text-body font-medium">Pengurangan</label>
        <Input id="jumlah" name="jumlah" type="number" inputMode="numeric" min={1} max={total} step={1} defaultValue={""} />
        <p className="text-small text-muted-foreground">
          Rupiah penuh, paling besar {formatRupiah(total)}. Tampil di Tagihan sebagai baris “Penyesuaian Harga Khusus” bernilai negatif.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="alasan" className="text-body font-medium">Alasan</label>
        <Input id="alasan" name="alasan" maxLength={500} placeholder="Keluarga dalam kesulitan" required />
        <p className="text-small text-muted-foreground">Tercatat di Audit Log sebagai alasan Harga Khusus.</p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="partnerShare" className="text-body font-medium">Bagian yang ditanggung Lokasi Mitra (opsional)</label>
        <Input id="partnerShare" name="partnerShare" type="number" inputMode="numeric" min={0} step={1} defaultValue={partnerShare || ""} />
        <p className="text-small text-muted-foreground">
          Kosongkan atau 0 bila Lokasi Mitra tidak menanggung apa pun: seluruh pengurangan ditanggung Operator. Bila diisi, nominal
          Pencairan pesanan ini turun sebesar nilai itu, jadi Lokasi Mitra harus setuju.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="partnerShareNote" className="text-body font-medium">Catatan Lokasi Mitra</label>
        <Input id="partnerShareNote" name="partnerShareNote" maxLength={500} placeholder="Lokasi Mitra mengiadakan sebagian" />
        <p className="text-small text-muted-foreground">Wajib diisi bila bagian yang ditanggung Lokasi Mitra lebih dari nol.</p>
      </div>
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" variant="secondary" disabled={pending || !bisaDiubah || nomorPemesanan === null}>
          {pending ? "Mengganti Tagihan…" : "Tetapkan Harga Khusus"}
        </Button>
        {!bisaDiubah ? (
          <p className="text-small text-muted-foreground">
            Tagihan ini sudah Lunas atau tidak bisa diganti, jadi Harga Khusus tidak bisa ditetapkan. Pengurangan setelah pembayaran perlu
            pengembalian dana, yang diproses lewat Antrean.
          </p>
        ) : null}
        <ServerResult state={state} />
      </div>
    </form>
  );
}
