"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TambahLayananPerpanjangan, type OpsiTambahLayanan } from "@/components/layanan/tambah-layanan-perpanjangan";
import { batalkanPermohonanAction, perbaikiPermohonanAction, pesanDariPermohonanAction, type PermohonanActionState } from "./actions";

const idle: PermohonanActionState = { status: "idle" };

function Umpanbalik({ state }: { state: PermohonanActionState }) {
  if (state.status === "idle") return null;
  return (
    <p role={state.status === "gagal" ? "alert" : "status"} className={state.status === "gagal" ? "text-body text-destructive" : "text-body text-muted-foreground"}>
      {state.message}
    </p>
  );
}

/** The applicant corrects a request sent back: any document may be picked again, the rest stay. */
export function PerbaikiForm({ permohonanId, berkas }: { permohonanId: string; berkas: { kunci: string; label: string }[] }) {
  const [state, action, pending] = useActionState(perbaikiPermohonanAction, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="permohonanId" value={permohonanId} />
      {berkas.map((satu) => (
        <label key={satu.kunci} className="flex flex-col gap-1 text-sm font-medium">
          {satu.label} (pilih lagi bila perlu diganti)
          <Input name={`berkas_${satu.kunci}`} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="h-auto py-2" />
        </label>
      ))}
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Mengirim…" : "Ajukan lagi"}
        </Button>
        <Umpanbalik state={state} />
      </div>
    </form>
  );
}

/** Withdraws a request before a decision. */
export function BatalkanForm({ permohonanId }: { permohonanId: string }) {
  const [state, action, pending] = useActionState(batalkanPermohonanAction, idle);
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="permohonanId" value={permohonanId} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Membatalkan…" : "Batalkan permohonan"}
      </Button>
      <Umpanbalik state={state} />
    </form>
  );
}

/** The term choice on an approved request: the same options and price as the direct path, then on to the Tagihan. */
export function PesanForm({ permohonanId, opsi, opsiLayanan }: { permohonanId: string; opsi: { terms: number; judul: string; keterangan: string }[]; opsiLayanan: OpsiTambahLayanan[] }) {
  const [state, action, pending] = useActionState(pesanDariPermohonanAction, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="permohonanId" value={permohonanId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Jumlah masa</legend>
        {opsi.map((satu, index) => (
          <label key={satu.terms} className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
            <input type="radio" name="terms" value={satu.terms} defaultChecked={index === 0} className="mt-1" />
            <span className="flex flex-col">
              <span className="font-medium">{satu.judul}</span>
              <span className="text-muted-foreground">{satu.keterangan}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <TambahLayananPerpanjangan opsi={opsiLayanan} />
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Membuat Tagihan…" : "Lanjut ke Tagihan"}
        </Button>
        <Umpanbalik state={state} />
      </div>
    </form>
  );
}
