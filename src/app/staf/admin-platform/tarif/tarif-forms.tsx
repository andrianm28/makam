"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import type { GlobalTariffKey } from "@/domain/tariffs";
import type { FormState } from "../../form-state";
import {
  simpanBiayaPemakaman,
  simpanTarifGlobal,
  simpanTarifJenisMakam,
  tambahJenisMakam,
  tandaiTarifDiperiksa,
} from "./actions";

const inputClass =
  "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const labelClass = "flex flex-col gap-1 text-sm font-medium";
const idle: FormState = { status: "idle" };

function Feedback({ state }: { state: FormState }) {
  if (state.status === "idle") return null;
  return state.status === "berhasil" ? (
    <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
      {state.message}
    </p>
  ) : (
    <p role="alert" className="text-sm text-destructive">
      {state.message}
    </p>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<"input">) {
  return (
    <label className={labelClass}>
      {label}
      <input className={inputClass} {...props} />
    </label>
  );
}

/** A whole-rupiah amount, typed with or without dots ("7.500.000"). */
function RupiahField(props: { label: string; name: string; required?: boolean; placeholder?: string }) {
  return <Field inputMode="numeric" autoComplete="off" pattern="(Rp\.?\s*)?[0-9. ]+" {...props} />;
}

function EffectiveOnAndReason({ today }: { today: string }) {
  return (
    <>
      <Field label="Berlaku mulai" name="effectiveOn" type="date" required min={today} defaultValue={today} />
      <Field label="Alasan (opsional)" name="reason" maxLength={500} placeholder="mis. sesuai perjanjian 2027" />
    </>
  );
}

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" disabled={pending} className="self-start">
      {children}
    </Button>
  );
}

/** A new version of one global tariff. */
export function GlobalTariffForm({ tariffKey, label, today }: { tariffKey: GlobalTariffKey; label: string; today: string }) {
  const [state, action, pending] = useActionState(simpanTarifGlobal, idle);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="key" value={tariffKey} />
      <RupiahField label={`${label} baru (Rp)`} name="amount" required placeholder="150.000" />
      <EffectiveOnAndReason today={today} />
      <div className="flex flex-col gap-2 sm:col-span-3">
        <Submit pending={pending}>Simpan versi baru</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** Harga Hak Pakai, tenure (Selamanya or N years) and the Perpanjangan price per term (optional for Selamanya). */
function JenisMakamTariffFields() {
  const [tenure, setTenure] = useState<"tahun" | "selamanya">("tahun");
  return (
    <>
      <RupiahField label="Harga Hak Pakai (Rp)" name="hargaHakPakai" required placeholder="7.500.000" />
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="font-medium">Masa Hak Pakai</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="tenure" value="tahun" checked={tenure === "tahun"} onChange={() => setTenure("tahun")} />
          N tahun
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="tenure"
            value="selamanya"
            checked={tenure === "selamanya"}
            onChange={() => setTenure("selamanya")}
          />
          Selamanya
        </label>
      </fieldset>
      {tenure === "tahun" ? (
        <>
          <Field label="Jumlah tahun per masa" name="tenureYears" type="number" min={1} max={100} required />
          <RupiahField label="Harga Perpanjangan per masa (Rp)" name="hargaPerpanjangan" required placeholder="3.000.000" />
        </>
      ) : (
        <RupiahField
          label="Harga Perpanjangan per masa (Rp, opsional: untuk Hak Pakai yang dibeli saat masih N tahun)"
          name="hargaPerpanjangan"
          placeholder="3.000.000"
        />
      )}
    </>
  );
}

/** Adds a Jenis Makam to a Lokasi Mitra with its first tariff. */
export function NewJenisMakamForm({ lokasiId, today }: { lokasiId: string; today: string }) {
  const [state, action, pending] = useActionState(tambahJenisMakam, idle);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <Field label="Nama Jenis Makam" name="name" required maxLength={120} placeholder="Reguler 1 × 2 m" />
      <Field label="Keterangan (opsional)" name="description" maxLength={500} placeholder="Blok A–C" />
      <JenisMakamTariffFields />
      <EffectiveOnAndReason today={today} />
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Submit pending={pending}>Tambah Jenis Makam</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** A new tariff version of one Jenis Makam. */
export function JenisMakamTariffForm({ lokasiId, jenisMakamId, today }: { lokasiId: string; jenisMakamId: string; today: string }) {
  const [state, action, pending] = useActionState(simpanTarifJenisMakam, idle);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="jenisMakamId" value={jenisMakamId} />
      <JenisMakamTariffFields />
      <EffectiveOnAndReason today={today} />
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Submit pending={pending}>Simpan tarif baru</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** A new Biaya Pemakaman (and tumpang amount) of a Lokasi Mitra. */
export function BiayaPemakamanForm({ lokasiId, today }: { lokasiId: string; today: string }) {
  const [state, action, pending] = useActionState(simpanBiayaPemakaman, idle);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <RupiahField label="Biaya Pemakaman (Rp)" name="biayaPemakaman" required placeholder="2.000.000" />
      <RupiahField label="Biaya Pemakaman tumpang (Rp, kosongkan bila sama)" name="biayaPemakamanTumpang" />
      <EffectiveOnAndReason today={today} />
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Submit pending={pending}>Simpan Biaya Pemakaman</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** Marks the Lokasi's tariffs "diperiksa" against the agreement (publish gate). */
export function TariffsCheckedForm({ lokasiId }: { lokasiId: string }) {
  const [state, action, pending] = useActionState(tandaiTarifDiperiksa, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <Field label="Catatan (opsional)" name="reason" maxLength={500} placeholder="mis. cocok dengan perjanjian" />
      <Submit pending={pending}>Tandai tarif sudah diperiksa</Submit>
      <Feedback state={state} />
    </form>
  );
}
