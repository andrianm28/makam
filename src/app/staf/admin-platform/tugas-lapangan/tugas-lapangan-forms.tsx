"use client";

import { useActionState } from "react";
import { PinPicker } from "@/components/map/pin-picker";
import { Button } from "@/components/ui/button";
import type { FormState } from "../../form-state";
import { buatTugasLapangan } from "./actions";

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

/** Admin Platform's form to create and assign a Tugas Lapangan of any type. */
export function CreateTugasLapanganForm({
  petugas,
  lokasiMitra,
  types,
}: {
  petugas: { accountId: string; email: string }[];
  lokasiMitra: { id: string; name: string }[];
  types: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(buatTugasLapangan, idle);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <label className={labelClass}>
        Jenis
        <select name="type" required defaultValue="kunjungan_verifikasi" className={inputClass}>
          {types.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
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
      <label className={labelClass}>
        Subjek
        <input name="subject" required maxLength={200} placeholder="mis. Taman Makam Wakaf Al-Ikhlas" className={inputClass} />
      </label>
      <label className={labelClass}>
        Lokasi Mitra (untuk Kunjungan Verifikasi / Cek Denah)
        <select name="lokasiId" defaultValue="" className={inputClass}>
          <option value="">Tidak terkait Lokasi Mitra</option>
          {lokasiMitra.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Alamat
        <input name="address" required maxLength={500} className={inputClass} />
      </label>
      <label className={labelClass}>
        Tanggal rencana
        <input type="date" name="plannedDate" required className={inputClass} />
      </label>
      <div className="sm:col-span-2">
        <PinPicker initial={null} />
      </div>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending} className="self-start">
          Buat dan tugaskan
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}
