"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { weekdays, type JamOperasional, type KontakSiaga, type TanggalTutup } from "@/domain/lokasi";
import { NAMA_HARI } from "@/lib/time/jakarta";
import type { FormState } from "../../../form-state";
import { pilihKontakSiaga, simpanJamOperasional } from "./actions";

const inputClass =
  "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const idle: FormState = { status: "idle" };

/** Each weekday with its Indonesian name (both lists are Monday first). */
const weekdayLabels = weekdays.map((weekday, index) => [weekday, NAMA_HARI[index]] as const);

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

/** The Tanggal Tutup as the textarea shows them: "2026-12-25 Natal", one per line. */
function tanggalTutupLines(tanggalTutup: TanggalTutup[]): string {
  return tanggalTutup.map((tutup) => `${tutup.date} ${tutup.note}`.trim()).join("\n");
}

/** Weekly hours per weekday (a weekday may be closed) and Tanggal Tutup, one per line. */
export function JamOperasionalForm({ lokasiId, jamOperasional }: { lokasiId: string; jamOperasional: JamOperasional | null }) {
  const [state, action, pending] = useActionState(simpanJamOperasional, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Jam per hari (WIB)</legend>
        {weekdayLabels.map(([weekday, label]) => {
          const hours = jamOperasional?.weekly[weekday] ?? null;
          return (
            <div key={weekday} className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex w-28 items-center gap-2">
                <input type="checkbox" name={`${weekday}Open`} value="ya" defaultChecked={hours !== null} />
                {label}
              </label>
              <label className="flex items-center gap-1">
                <span className="sr-only">{label}: buka</span>
                <input className={inputClass} type="time" name={`${weekday}Opens`} defaultValue={hours?.opens ?? "08:00"} />
              </label>
              <span aria-hidden>–</span>
              <label className="flex items-center gap-1">
                <span className="sr-only">{label}: tutup</span>
                <input className={inputClass} type="time" name={`${weekday}Closes`} defaultValue={hours?.closes ?? "16:00"} />
              </label>
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">Hari tanpa centang dianggap tutup.</p>
      </fieldset>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Tanggal tutup
        <textarea
          name="tanggalTutup"
          rows={5}
          defaultValue={tanggalTutupLines(jamOperasional?.tanggalTutup ?? [])}
          placeholder={"2026-12-25 Natal\n2027-03-20 Idul Fitri"}
          className="rounded-lg border border-input bg-background px-3 py-2 font-mono outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <span className="text-xs font-normal text-muted-foreground">Satu tanggal per baris (TTTT-BB-HH), keterangan boleh menyusul.</span>
      </label>
      <Button type="submit" disabled={pending} className="self-start">
        Simpan Jam Operasional
      </Button>
      <Feedback state={state} />
    </form>
  );
}

/** Picks the Kontak Siaga from this Lokasi's Admin Lokasi. */
export function KontakSiagaForm({
  lokasiId,
  adminLokasi,
  kontakSiaga,
}: {
  lokasiId: string;
  adminLokasi: { accountId: string; phoneNumber: string; email: string | null }[];
  kontakSiaga: KontakSiaga | null;
}) {
  const [state, action, pending] = useActionState(pilihKontakSiaga, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Kontak Siaga
        <select name="accountId" required defaultValue={kontakSiaga?.accountId ?? ""} className={inputClass}>
          <option value="" disabled>
            Pilih Admin Lokasi
          </option>
          {adminLokasi.map((account) => (
            <option key={account.accountId} value={account.accountId}>
              {account.phoneNumber}
              {account.email ? ` (${account.email})` : ""}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={pending} className="self-start">
        Simpan Kontak Siaga
      </Button>
      <Feedback state={state} />
    </form>
  );
}
