"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRupiah } from "@/lib/rupiah";
import { ServerResult, idleFormState } from "../../../form-feedback";
import { batalkanPembayaranLangsungAction, catatPembayaranManualAction, tetapkanHargaKhususAction } from "./actions";

/**
 * Catat pembayaran manual (spec, Billing > Payment: "Transfer manual / Tunai by
 * Admin Platform with proof"; ticket 30's AC 1): the method, the time the money
 * arrived (the transfer's own time, as the slip shows it), and the slip itself.
 * The proof is not optional — the form cannot be submitted without one, and the
 * module refuses the write without one anyway.
 */
export function PembayaranManualForm({ tagihanId, total, bisaDibayar }: { tagihanId: string; total: number; bisaDibayar: boolean }) {
  const [state, action, pending] = useActionState(catatPembayaranManualAction, idleFormState);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="tagihanId" value={tagihanId} />
      <div className="flex flex-col gap-2">
        <label htmlFor="metode" className="text-body font-medium">
          Metode
        </label>
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
          Transfer ke rekening Operator, atau uang tunai di tempat. Pembayaran yang keluarga lakukan langsung ke Lokasi Mitra
          dicatat oleh Admin Lokasi di halaman pesanan, bukan di sini.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="reference" className="text-body font-medium">
          Referensi transfer (opsional)
        </label>
        <Input id="reference" name="reference" maxLength={200} placeholder="Nomor bukti transfer" />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="dibayarPada" className="text-body font-medium">
          Waktu pembayaran (opsional)
        </label>
        <Input id="dibayarPada" name="dibayarPada" type="datetime-local" />
        <p className="text-small text-muted-foreground">Kosongkan berarti waktu pencatatan. Yang dicatat harus sebelum batas pembayaran Tagihan.</p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="bukti" className="text-body font-medium">
          Bukti pembayaran
        </label>
        <Input id="bukti" name="bukti" type="file" accept="image/jpeg,image/png,application/pdf" required />
        <p className="text-small text-muted-foreground">
          Foto bukti transfer atau nota, atau PDF-nya. Paling besar 10 MB. Berkas ini tersimpan di penyimpanan privat.
        </p>
      </div>
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" disabled={pending || !bisaDibayar}>
          {pending ? "Mencatat…" : `Catat pembayaran ${formatRupiah(total)}`}
        </Button>
        {!bisaDibayar ? (
          <p className="text-small text-destructive">Tagihan ini sudah Lunas atau tidak bisa dibayar lagi, jadi pembayaran tidak bisa dicatat di sini.</p>
        ) : null}
        <ServerResult state={state} />
      </div>
    </form>
  );
}

/**
 * Harga Khusus (spec, Billing and Payouts; ticket 30's AC 3, 4): what comes off
 * this Tagihan and why, and what the Lokasi Mitra agreed to bear of it.
 * Submitting cancels and replaces the Tagihan with a new one carrying the
 * reduction as its own negative line — an issued Tagihan is never edited — and
 * the due date does not move. A reduction equal to the whole total makes the
 * new Tagihan Rp 0, Lunas at once.
 */
export function HargaKhususForm({ tagihanId, total, bisaDiubah }: { tagihanId: string; total: number; bisaDiubah: boolean }) {
  const [state, action, pending] = useActionState(tetapkanHargaKhususAction, idleFormState);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="tagihanId" value={tagihanId} />
      <div className="flex flex-col gap-2">
        <label htmlFor="amount" className="text-body font-medium">
          Pengurangan
        </label>
        <Input id="amount" name="amount" type="number" inputMode="numeric" min={1} max={total} step={1} required />
        <p className="text-small text-muted-foreground">
          Rupiah penuh, paling besar {formatRupiah(total)}. Tampil di Tagihan sebagai baris &ldquo;Penyesuaian Harga Khusus&rdquo; bernilai negatif.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="alasan" className="text-body font-medium">
          Alasan
        </label>
        <Input id="alasan" name="alasan" maxLength={500} placeholder="Keluarga dalam kesulitan" required />
        <p className="text-small text-muted-foreground">Tercatat di Audit Log sebagai alasan Harga Khusus.</p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="porsiMitra" className="text-body font-medium">
          Bagian yang ditanggung Lokasi Mitra (opsional)
        </label>
        <Input id="porsiMitra" name="porsiMitra" type="number" inputMode="numeric" min={0} step={1} />
        <p className="text-small text-muted-foreground">
          Kosongkan atau 0 bila Lokasi Mitra tidak menanggung apa pun: seluruh pengurangan ditanggung Operator. Bila diisi,
          nominal Pencairan pesanan ini turun sebesar nilai itu, jadi Lokasi Mitra harus setuju.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="catatanPorsiMitra" className="text-body font-medium">
          Catatan Lokasi Mitra
        </label>
        <Input id="catatanPorsiMitra" name="catatanPorsiMitra" maxLength={500} placeholder="Lokasi Mitra setuju menanggung sebagian" />
        <p className="text-small text-muted-foreground">Wajib diisi bila bagian yang ditanggung Lokasi Mitra lebih dari nol.</p>
      </div>
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" variant="secondary" disabled={pending || !bisaDiubah}>
          {pending ? "Mengganti Tagihan…" : "Tetapkan Harga Khusus"}
        </Button>
        {!bisaDiubah ? (
          <p className="text-small text-muted-foreground">
            Tagihan ini sudah Lunas, dibatalkan, atau sudah lewat jatuh tempo, jadi tidak bisa diganti.
          </p>
        ) : null}
        <ServerResult state={state} />
      </div>
    </form>
  );
}

/**
 * Reverses a "Dibayar langsung ke Lokasi Mitra" record (ticket 30's AC 2,
 * Admin Platform only). The Tagihan and its Bukti Pembayaran are untouched;
 * only Payouts' own read of the payment (a platform-fee Potongan instead of a
 * tariff Pencairan) is undone, so the next Pencairan run treats the order as
 * an ordinary partner-paid one.
 */
export function BatalkanPembayaranLangsungForm({ tagihanId }: { tagihanId: string }) {
  const [state, action, pending] = useActionState(batalkanPembayaranLangsungAction, idleFormState);
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="tagihanId" value={tagihanId} />
      <Button type="submit" variant="destructive" disabled={pending}>
        {pending ? "Membatalkan…" : "Batalkan pembayaran langsung"}
      </Button>
      <ServerResult state={state} />
    </form>
  );
}
