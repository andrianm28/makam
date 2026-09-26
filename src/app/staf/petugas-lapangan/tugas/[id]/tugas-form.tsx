"use client";

import { useActionState, useState } from "react";
import { PinMap, type Pin } from "@/components/map/pin-map";
import { Button } from "@/components/ui/button";
import type { RequiredUpload, TugasLapangan } from "@/domain/fieldwork";
import type { FormState } from "../../../form-state";
import { selesaikanTugas } from "../actions";

const inputClass =
  "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
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

const rounded = (value: number) => Number(value.toFixed(6));

/** The pin field: for Kunjungan Verifikasi it is confirmed (draggable) at the Lokasi's gate; otherwise shown read-only. */
function PinField({ initial, editable }: { initial: Pin | null; editable: boolean }) {
  const [pin, setPin] = useState<Pin | null>(initial);
  return (
    <div className="flex flex-col gap-2">
      <PinMap
        pin={pin}
        onPinChange={editable ? setPin : undefined}
        label="Pin Lokasi"
        className="h-56 w-full rounded-lg border"
      />
      {editable ? (
        <p className="text-xs text-muted-foreground">Klik peta atau geser pin untuk mengonfirmasi pin di gerbang Lokasi.</p>
      ) : null}
      <input type="hidden" name="pinLat" value={pin ? rounded(pin.lat) : ""} />
      <input type="hidden" name="pinLng" value={pin ? rounded(pin.lng) : ""} />
    </div>
  );
}

function UploadFields({ required }: { required: RequiredUpload[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {required.map((upload) => (
        <label key={upload.kind} className="flex flex-col gap-1 text-sm font-medium">
          {upload.label} {upload.min > 0 ? "(wajib)" : null}
          <input
            type="file"
            name={`uploads_${upload.kind}`}
            accept="image/jpeg,image/png,image/webp,application/pdf"
            multiple
            required={upload.min > 0}
            className={inputClass}
          />
        </label>
      ))}
    </div>
  );
}

/** The Kunjungan Verifikasi form: confirms address, pin, facilities and uploads photos. */
function KunjunganVerifikasiFields({
  tugas,
  facilityOptions,
}: {
  tugas: TugasLapangan;
  facilityOptions: { value: string; label: string }[];
}) {
  const facilities = (tugas.form.facilities as { checked?: string[]; note?: string } | undefined) ?? {};
  return (
    <>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="addressConfirmed" defaultChecked className="size-4" /> Alamat sesuai
      </label>
      <PinField initial={tugas.pin} editable />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Fasilitas yang ada</legend>
        {facilityOptions.map(({ value, label }) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="facilities"
              value={value}
              defaultChecked={facilities.checked?.includes(value)}
              className="size-4"
            />
            {label}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Catatan fasilitas
        <input name="facilitiesNote" defaultValue={facilities.note ?? ""} maxLength={1000} className={inputClass} />
      </label>
    </>
  );
}

/** The Cek Denah form: a spot-check of the Denah against what is on site. */
function CekDenahFields() {
  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      <input type="checkbox" name="sesuaiDenah" defaultChecked className="size-4" /> Denah sesuai dengan kondisi di lapangan
    </label>
  );
}

/** Petugas Lapangan's type-specific form (spec, story 173), gated on its required uploads (story 174). */
export function TugasLapanganForm({
  tugas,
  required,
  facilityOptions,
}: {
  tugas: TugasLapangan;
  required: RequiredUpload[];
  facilityOptions: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(selesaikanTugas, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={tugas.id} />
      <input type="hidden" name="type" value={tugas.type} />
      {tugas.type === "kunjungan_verifikasi" ? (
        <KunjunganVerifikasiFields tugas={tugas} facilityOptions={facilityOptions} />
      ) : tugas.type === "cek_denah" ? (
        <CekDenahFields />
      ) : null}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Catatan
        <textarea name="note" maxLength={2000} rows={3} className="rounded-lg border border-input bg-background p-3" />
      </label>
      <UploadFields required={required} />
      <div className="flex flex-col gap-2">
        <Button type="submit" disabled={pending} className="self-start">
          Tandai Selesai
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}
