"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { LokasiMitra } from "@/domain/lokasi";
import type { FormState } from "../../../form-state";
import { buatTugasLapangan } from "../../tugas-lapangan/actions";

const inputClass =
  "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const idle: FormState = { status: "idle" };

/**
 * Admin Platform orders a Lokasi revisit ad hoc (spec, story 151 / Field
 * Work): creates a Kunjungan Verifikasi Tugas Lapangan for this Lokasi.
 * There is no automatic revisit schedule in v1 (only this button).
 */
export function MintaKunjunganUlangForm({
  lokasiMitra,
  petugas,
}: {
  lokasiMitra: LokasiMitra;
  petugas: { accountId: string; email: string }[];
}) {
  const [state, action, pending] = useActionState(buatTugasLapangan, idle);
  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
      <input type="hidden" name="type" value="kunjungan_verifikasi" />
      <input type="hidden" name="lokasiId" value={lokasiMitra.id} />
      <input type="hidden" name="subject" value={lokasiMitra.name} />
      <input type="hidden" name="address" value={lokasiMitra.address} />
      <input type="hidden" name="pinLat" value={lokasiMitra.pin?.lat ?? ""} />
      <input type="hidden" name="pinLng" value={lokasiMitra.pin?.lng ?? ""} />
      {petugas.length === 0 ? (
        <p className="text-small text-muted-foreground">Belum ada Petugas Lapangan aktif untuk ditugaskan.</p>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Petugas Lapangan
            <select name="assigneeAccountId" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Pilih Petugas Lapangan
              </option>
              {petugas.map((account) => (
                <option key={account.accountId} value={account.accountId}>
                  {account.email}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Tanggal rencana
            <input type="date" name="plannedDate" required className={inputClass} />
          </label>
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            Minta kunjungan ulang
          </Button>
        </>
      )}
      {state.status !== "idle" ? (
        <p role={state.status === "gagal" ? "alert" : "status"} className="text-sm basis-full">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
