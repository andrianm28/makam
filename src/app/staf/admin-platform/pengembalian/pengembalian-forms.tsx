"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import type { PermintaanPengembalian } from "@/domain/refunds";
import type { FormState } from "../../form-state";
import { ajukanGoodwillAction, isiRekeningAdminAction, setujuiPengembalianAction, terbitkanBuktiPengembalianDanaAction } from "./actions";

const inputClass =
  "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const labelClass = "flex flex-col gap-1 text-sm font-medium";
const idle: FormState = { status: "idle" };

function Feedback({ state }: { state: FormState }) {
  if (state.status === "idle") return null;
  return state.status === "berhasil" ? (
    <p role="status" className="text-sm text-success-soft-foreground">
      {state.message}
    </p>
  ) : (
    <p role="alert" className="text-sm text-destructive">
      {state.message}
    </p>
  );
}

/** Admin Platform raises a goodwill refund on any Tagihan, by hand. */
export function GoodwillForm() {
  const [state, action, mengirim] = useActionState(ajukanGoodwillAction, idle);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <label className={labelClass}>
        ID Tagihan
        <input name="tagihanId" required className={inputClass} />
      </label>
      <label className={labelClass}>
        Nomor Tagihan
        <input name="nomorTagihan" required className={inputClass} />
      </label>
      <label className={labelClass}>
        Nomor Pemesanan (opsional)
        <input name="nomorPemesanan" className={inputClass} />
      </label>
      <label className={labelClass}>
        Jumlah (Rupiah)
        <input name="jumlah" type="number" min={1} required className={inputClass} />
      </label>
      <label className={`${labelClass} sm:col-span-2`}>
        Catatan
        <input name="catatan" required maxLength={500} className={inputClass} />
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" variant="secondary" disabled={mengirim}>
          {mengirim ? "Mengajukan…" : "Ajukan goodwill"}
        </Button>
      </div>
      <div className="sm:col-span-2">
        <Feedback state={state} />
      </div>
    </form>
  );
}

/**
 * The three steps one open request goes through: approve, bank account, transfer.
 *
 * `biayaBawaan` is the payable fee the fault rule allows on a Tagihan with a
 * Harga Khusus, or null when the fee may not be overridden (no Harga Khusus, or
 * no fee being returned). The one field is prefilled with it; when Admin
 * Platform lowers it, a Catatan is required (owner decision 2026-10-01).
 */
export function PermintaanForms({ permintaan, biayaBawaan }: { permintaan: PermintaanPengembalian; biayaBawaan: number | null }) {
  const [setujuiState, setujuiAction, menyetujui] = useActionState(setujuiPengembalianAction, idle);
  const [rekeningState, rekeningAction, mengisi] = useActionState(isiRekeningAdminAction, idle);
  const [transferState, transferAction, mentransfer] = useActionState(terbitkanBuktiPengembalianDanaAction, idle);
  const [biaya, setBiaya] = useState(biayaBawaan === null ? "" : String(biayaBawaan));
  // Mirrors the Server Action: an emptied field is no override (the action turns "" into undefined), and
  // only a value that really differs from the fault rule's default needs the mandatory Catatan.
  const biayaDiubah = biayaBawaan !== null && biaya.trim() !== "" && biaya !== String(biayaBawaan);

  if (permintaan.status === "diajukan") {
    return (
      <form action={setujuiAction} className="flex flex-col gap-2 sm:items-start">
        <input type="hidden" name="permintaanId" value={permintaan.id} />
        {biayaBawaan !== null ? (
          <>
            <label className={labelClass}>
              Biaya Layanan Platform yang dikembalikan (Rupiah)
              <input
                name="biayaLayananPlatform"
                type="number"
                min={0}
                max={biayaBawaan}
                value={biaya}
                onChange={(event) => setBiaya(event.target.value)}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Catatan {biayaDiubah ? "(wajib: biaya diubah)" : "(opsional)"}
              <input name="catatan" required={biayaDiubah} maxLength={500} className={inputClass} />
            </label>
          </>
        ) : null}
        <Button type="submit" disabled={menyetujui}>
          {menyetujui ? "Menyetujui…" : "Setujui permintaan"}
        </Button>
        <Feedback state={setujuiState} />
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {permintaan.rekening ? (
        <p className="text-sm text-muted-foreground">
          Rekening tujuan: {permintaan.rekening.bank} · {permintaan.rekening.nomor} a.n. {permintaan.rekening.nama}
        </p>
      ) : null}
      <form action={rekeningAction} className="grid gap-3 sm:grid-cols-3">
        <input type="hidden" name="permintaanId" value={permintaan.id} />
        <label className={labelClass}>
          Nama bank
          <input name="bank" required maxLength={100} className={inputClass} />
        </label>
        <label className={labelClass}>
          Nomor rekening
          <input name="nomor" required maxLength={50} className={inputClass} />
        </label>
        <label className={labelClass}>
          Nama pemilik rekening
          <input name="nama" required maxLength={200} className={inputClass} />
        </label>
        <label className={`${labelClass} sm:col-span-3`}>
          Alasan {permintaan.rekening ? "mengubah" : "mencatat"} rekening
          <input name="alasan" required maxLength={500} className={inputClass} />
        </label>
        <div className="sm:col-span-3">
          <Button type="submit" variant="secondary" disabled={mengisi}>
            {mengisi ? "Menyimpan…" : permintaan.rekening ? "Ubah rekening" : "Simpan rekening"}
          </Button>
        </div>
        <div className="sm:col-span-3">
          <Feedback state={rekeningState} />
        </div>
      </form>

      <form action={transferAction} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="permintaanId" value={permintaan.id} />
        <label className={labelClass}>
          Tanggal transfer
          <input name="ditransferPada" type="date" required className={inputClass} />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Foto atau scan bukti transfer
          <input name="bukti" type="file" required accept="image/jpeg,image/png,application/pdf" />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={mentransfer || !permintaan.rekening}>
            {mentransfer ? "Mentransfer…" : "Catat transfer dan terbitkan Bukti"}
          </Button>
        </div>
        <div className="sm:col-span-2">
          <Feedback state={transferState} />
        </div>
      </form>
    </div>
  );
}
