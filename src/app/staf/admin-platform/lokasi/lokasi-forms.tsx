"use client";

import { useActionState } from "react";
import { PinPicker } from "@/components/map/pin-picker";
import { Button } from "@/components/ui/button";
import type { LokasiFlags, LokasiMitra, LokasiPolicies } from "@/domain/lokasi";
import type { FormState } from "../../form-state";
import {
  buatLokasiMitra,
  lepasAdminLokasi,
  simpanDokumen,
  simpanKebijakan,
  simpanProfil,
  simpanRekening,
  undangAdminLokasi,
  unggahPerjanjian,
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

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" disabled={pending} className="self-start">
      {children}
    </Button>
  );
}

/** Starts a Lokasi Mitra's onboarding record. */
export function CreateLokasiForm() {
  const [state, action, pending] = useActionState(buatLokasiMitra, idle);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Nama Lokasi Mitra" name="name" required maxLength={200} />
      <Field label="Nama pengelola" name="pengelolaName" required maxLength={200} />
      <Field label="Alamat" name="address" required maxLength={500} />
      <Field label="Kota / kabupaten" name="city" required maxLength={120} placeholder="Kota Jakarta Timur" />
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Submit pending={pending}>Buat Lokasi Mitra</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** Name, pengelola, address, city, pin and facilities. */
export function ProfileForm({
  lokasiMitra,
  facilities,
}: {
  lokasiMitra: LokasiMitra;
  facilities: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(simpanProfil, idle);
  const checked: string[] = lokasiMitra.facilities.checked;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="lokasiId" value={lokasiMitra.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nama Lokasi Mitra" name="name" required defaultValue={lokasiMitra.name} maxLength={200} />
        <Field label="Nama pengelola" name="pengelolaName" required defaultValue={lokasiMitra.pengelolaName} maxLength={200} />
        <Field label="Alamat" name="address" required defaultValue={lokasiMitra.address} maxLength={500} />
        <Field label="Kota / kabupaten" name="city" required defaultValue={lokasiMitra.city} maxLength={120} />
      </div>
      <PinPicker initial={lokasiMitra.pin} />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Fasilitas</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {facilities.map((facility) => (
            <label key={facility.value} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="facilities" value={facility.value} defaultChecked={checked.includes(facility.value)} />
              {facility.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className={labelClass}>
        Catatan fasilitas
        <textarea
          name="facilitiesNote"
          defaultValue={lokasiMitra.facilities.note}
          maxLength={1000}
          rows={2}
          className="rounded-lg border border-input bg-background px-3 py-2"
        />
      </label>
      <Submit pending={pending}>Simpan profil</Submit>
      <Feedback state={state} />
    </form>
  );
}

/** Uploads the agreement scan with its signing date. */
export function AgreementForm({ lokasiId, signedOn }: { lokasiId: string; signedOn: string | null }) {
  const [state, action, pending] = useActionState(unggahPerjanjian, idle);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <Field label="Scan perjanjian" name="scan" type="file" accept="application/pdf,image/jpeg,image/png" required />
      <Field label="Tanggal perjanjian" name="signedOn" type="date" required defaultValue={signedOn ?? ""} />
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Submit pending={pending}>Unggah perjanjian</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** Sets or changes the bank account (Admin Platform only). */
export function BankAccountForm({ lokasiMitra }: { lokasiMitra: LokasiMitra }) {
  const [state, action, pending] = useActionState(simpanRekening, idle);
  const current = lokasiMitra.bankAccount;
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="lokasiId" value={lokasiMitra.id} />
      <Field label="Bank" name="bankName" required defaultValue={current?.bankName ?? ""} maxLength={100} />
      <Field
        label="Nomor rekening"
        name="accountNumber"
        required
        inputMode="numeric"
        defaultValue={current?.accountNumber ?? ""}
        maxLength={40}
      />
      <Field label="Atas nama" name="accountHolder" required defaultValue={current?.accountHolder ?? ""} maxLength={200} />
      <Field label="Alasan perubahan (opsional)" name="reason" maxLength={500} />
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Submit pending={pending}>Simpan rekening</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** The document checklist, one document per line. */
export function DocumentsForm({ lokasiId, documents }: { lokasiId: string; documents: string[] }) {
  const [state, action, pending] = useActionState(simpanDokumen, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <label className={labelClass}>
        Dokumen yang dibawa keluarga (satu per baris)
        <textarea
          name="documents"
          defaultValue={documents.join("\n")}
          rows={5}
          maxLength={4000}
          className="rounded-lg border border-input bg-background px-3 py-2"
        />
      </label>
      <Submit pending={pending}>Simpan daftar dokumen</Submit>
      <Feedback state={state} />
    </form>
  );
}

function Checkbox({
  label,
  name,
  checked,
  lockedNote,
}: {
  label: string;
  name: string;
  checked: boolean;
  /** Shown disabled with this note: the flag cannot be changed yet. */
  lockedNote?: string;
}) {
  const noteId = `${name}-catatan`;
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <input
        type="checkbox"
        name={name}
        value="ya"
        defaultChecked={checked}
        disabled={lockedNote !== undefined}
        aria-describedby={lockedNote ? noteId : undefined}
      />
      {label}
      {lockedNote ? (
        <span id={noteId} className="text-muted-foreground">
          ({lockedNote})
        </span>
      ) : null}
    </label>
  );
}

/** Policies and flags. */
export function PoliciesForm({
  lokasiId,
  policies,
  flags,
}: {
  lokasiId: string;
  policies: LokasiPolicies;
  flags: LokasiFlags;
}) {
  const [state, action, pending] = useActionState(simpanKebijakan, idle);
  const number = (label: string, name: keyof LokasiPolicies) => (
    <Field label={label} name={name} type="number" min={0} step={1} required defaultValue={policies[name]} />
  );
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <div className="grid gap-3 sm:grid-cols-2">
        {number("Masa Tenggang (bulan)", "masaTenggangMonths")}
        {number("Perpanjangan paling banyak (masa, K)", "maxPerpanjanganTerms")}
        {number("Tahan Petak Terencana (jam)", "terencanaHoldHours")}
        {number("Batas bayar Saat Duka (jam)", "saatDukaPaymentWindowHours")}
        {number("Masa Pembatalan (hari)", "masaPembatalanDays")}
        {number("Refund setelah Masa Pembatalan (%)", "refundAfterMasaPembatalanPercent")}
        {number("Biaya Ganti Pemegang Hak (Rp, dibayar langsung ke Lokasi)", "gantiPemegangHakFee")}
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Flag</legend>
        <Checkbox
          label="Pemesanan Terencana aktif"
          name="pemesananTerencanaAktif"
          checked={flags.pemesananTerencanaAktif}
          lockedNote="Tersedia setelah Denah dan Cek Denah"
        />
        <Checkbox label="Boleh tumpang" name="tumpangAllowed" checked={flags.tumpang.allowed} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Tumpang: minimal tahun sejak Pemakaman terakhir"
            name="tumpangMinYears"
            type="number"
            min={0}
            step={1}
            required
            defaultValue={flags.tumpang.minYears}
          />
          <Field
            label="Tumpang: paling banyak lapis"
            name="tumpangMaxLayers"
            type="number"
            min={2}
            step={1}
            required
            defaultValue={flags.tumpang.maxLayers}
          />
        </div>
        <Checkbox label="Tumpang di petak yang sudah dilepas boleh" name="tumpangOnReleasedPlots" checked={flags.tumpangOnReleasedPlots} />
        <Checkbox
          label="Ganti Pemegang Hak karena jual beli boleh (karena waris selalu boleh)"
          name="saleTransfersAllowed"
          checked={flags.saleTransfersAllowed}
        />
      </fieldset>
      <Submit pending={pending}>Simpan kebijakan</Submit>
      <Feedback state={state} />
    </form>
  );
}

/** Invites an Admin Lokasi to this Lokasi Mitra. */
export function InviteAdminLokasiForm({ lokasiId }: { lokasiId: string }) {
  const [state, action, pending] = useActionState(undangAdminLokasi, idle);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <Field label="Nomor WhatsApp" name="phoneNumber" type="tel" inputMode="tel" required placeholder="0812 3456 7890" />
      <Field label="Email" name="email" type="email" required placeholder="nama@contoh.id" />
      <Field label="Catatan (opsional)" name="reason" maxLength={500} />
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Submit pending={pending}>Undang Admin Lokasi</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** Removes one Admin Lokasi from this Lokasi Mitra, with a reason. */
export function RemoveAdminLokasiForm({ lokasiId, accountId }: { lokasiId: string; accountId: string }) {
  const [state, action, pending] = useActionState(lepasAdminLokasi, idle);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="accountId" value={accountId} />
      <label className="sr-only" htmlFor={`alasan-lepas-${accountId}`}>
        Alasan
      </label>
      <input id={`alasan-lepas-${accountId}`} name="reason" required maxLength={500} placeholder="Alasan" className={inputClass} />
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        Lepas
      </Button>
      <Feedback state={state} />
    </form>
  );
}
