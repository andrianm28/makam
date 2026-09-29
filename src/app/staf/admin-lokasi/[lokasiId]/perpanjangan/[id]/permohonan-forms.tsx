"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "../../../../form-state";
import { mintaPerbaikanAction, setujuiPermohonanAction, tolakPermohonanAction } from "./actions";

const idle: FormState = { status: "idle" };

function Umpanbalik({ state }: { state: FormState }) {
  if (state.status === "idle") return null;
  return (
    <p role={state.status === "gagal" ? "alert" : "status"} className="text-caption text-muted-foreground">
      {state.message}
    </p>
  );
}

const textareaClass =
  "w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

/**
 * The approval: the reason, and what the papers may correct. A Hak Pakai flagged Perlu Verifikasi with
 * no end date asks for it here, because completing it is part of the review.
 */
export function SetujuiForm({
  lokasiId,
  permohonanId,
  ubahPemegang,
  perluTanggal,
  namaAwal,
}: {
  lokasiId: string;
  permohonanId: string;
  /** The words for what approval records: "Pemegang Hak baru" (heir, claim) or "email dan nomor telepon Pemegang Hak" (KTP). */
  ubahPemegang: string;
  perluTanggal: boolean;
  namaAwal: string;
}) {
  const [state, action, pending] = useActionState(setujuiPermohonanAction, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="permohonanId" value={permohonanId} />
      <p className="text-small text-muted-foreground">Menyetujui mencatat {ubahPemegang} pada Hak Pakai ini. Pemohon lalu punya 30 hari untuk memilih masa dan membayar.</p>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nama Pemegang Hak (kosongkan bila sesuai)
        <Input name="nama" defaultValue="" placeholder={namaAwal} maxLength={200} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nomor telepon (kosongkan bila sesuai)
        <Input name="nomorTelepon" type="tel" maxLength={30} />
      </label>
      {perluTanggal ? (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Tanggal berakhir Hak Pakai
          <Input name="endDate" type="date" />
          <span className="text-small font-normal text-muted-foreground">Hak Pakai ini masih Perlu Verifikasi dan belum punya tanggal berakhir. Isi dari berkas yang ada.</span>
        </label>
      ) : null}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Alasan (dicatat di Audit Log)
        <textarea name="alasan" rows={2} maxLength={500} className={textareaClass} />
      </label>
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" disabled={pending} data-testid="setujui-permohonan">
          {pending ? "Menyetujui…" : "Setujui permohonan"}
        </Button>
        <Umpanbalik state={state} />
      </div>
    </form>
  );
}

/** Rejects, or sends back for correction: both need the reason the applicant will read. */
export function PutuskanForm({ lokasiId, permohonanId, jenis }: { lokasiId: string; permohonanId: string; jenis: "tolak" | "perbaikan" }) {
  const [state, action, pending] = useActionState(jenis === "tolak" ? tolakPermohonanAction : mintaPerbaikanAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="permohonanId" value={permohonanId} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        {jenis === "tolak" ? "Alasan ditolak (dibaca pemohon)" : "Yang perlu diperbaiki (dibaca pemohon)"}
        <textarea name="alasan" rows={3} maxLength={500} className={textareaClass} />
      </label>
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" variant="outline" disabled={pending} data-testid={jenis === "tolak" ? "tolak-permohonan" : "minta-perbaikan"}>
          {pending ? "Mengirim…" : jenis === "tolak" ? "Tolak permohonan" : "Minta perbaikan"}
        </Button>
        <Umpanbalik state={state} />
      </div>
    </form>
  );
}
