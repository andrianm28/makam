"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { buktiLabels, frekuensiLabels } from "@/lib/layanan-labels";
import type { FormState } from "../../form-state";
import {
  buatPaket,
  hapusPaket,
  hapusVarian,
  simpanHargaDki,
  simpanTarifMitraJasa,
  stopLayanan,
  tambahLayanan,
  tambahVarian,
  tandaiBolehDiTpu,
  tawarkanLayanan,
  ubahLayanan,
  ubahPaket,
} from "./actions";

const inputClass =
  "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const labelClass = "flex flex-col gap-1 text-sm font-medium";
const idle: FormState = { status: "idle" };

/** The result of a save, inline and as a status message (the staff shell toasts it too). */
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

function Field({ label, ...props }: { label: string } & React.ComponentProps<"input">) {
  return (
    <label className={labelClass}>
      {label}
      <input className={inputClass} {...props} />
    </label>
  );
}

/** One whole-rupiah amount, typed with or without dots ("500.000"). */
function RupiahField(props: { label: string; name: string; placeholder?: string }) {
  return <Field inputMode="numeric" autoComplete="off" pattern="(Rp\.?\s*)?[0-9. ]+" defaultValue="" {...props} />;
}

function TextArea({ label, name, rows = 3, placeholder }: { label: string; name: string; rows?: number; placeholder?: string }) {
  return (
    <label className={labelClass}>
      {label}
      <textarea className={`${inputClass} h-auto py-2`} name={name} rows={rows} placeholder={placeholder} />
    </label>
  );
}

function Select({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  options: readonly (readonly [string, string])[];
  defaultValue?: string;
}) {
  return (
    <label className={labelClass}>
      {label}
      <select className={inputClass} name={name} defaultValue={defaultValue}>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function Flag({ label, name, defaultChecked }: { label: string; name: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4 accent-primary" />
      {label}
    </label>
  );
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

const buktiOptions = Object.entries(buktiLabels) as readonly (readonly [string, string])[];
const frekuensiOptions = Object.entries(frekuensiLabels) as readonly (readonly [string, string])[];

/** One Layanan's own fields, shared by the add and the change form. */
function LayananFields({ defaults }: { defaults?: { name: string; description: string; bukti: string; leadTimeDays: number; bisaHariH: boolean; adaDiPetakKosong: boolean; teksLabel: string | null } }) {
  return (
    <>
      <Field label="Nama" name="name" required maxLength={120} defaultValue={defaults?.name} placeholder="mis. Pembersihan Makam" />
      <TextArea label="Keterangan" name="description" placeholder="Apa saja yang dikerjakan." />
      <Select label="Bukti yang harus dilampirkan" name="bukti" options={buktiOptions} defaultValue={defaults?.bukti ?? "foto_sesudah"} />
      <Field
        label="Paling cepat dikerjakan (hari)"
        name="leadTimeDays"
        type="number"
        min={0}
        max={365}
        required
        defaultValue={defaults?.leadTimeDays ?? 1}
      />
      <Field label="Isian bebas (opsional)" name="teksLabel" maxLength={200} defaultValue={defaults?.teksLabel ?? ""} placeholder="mis. Teks nisan" />
      <div className="flex flex-col gap-2 sm:col-span-3">
        <Flag label="Bisa ditambahkan pada hari pemakaman (bisa hari-H)" name="bisaHariH" defaultChecked={defaults?.bisaHariH} />
        <Flag label="Berah di petak yang belum ada jenazah" name="adaDiPetakKosong" defaultChecked={defaults?.adaDiPetakKosong} />
      </div>
      <input type="hidden" name="reason" value="" />
    </>
  );
}

/** Admin Platform adds a Layanan to the catalog, with one Pilihan per line. */
export function TambahLayananForm() {
  const [state, action, pending] = useActionState(tambahLayanan, idle);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <LayananFields />
      <TextArea label="Pilihan (satu per baris)" name="varian" rows={3} placeholder={"Reguler\nLengkap"} />
      <div className="flex flex-col gap-2 sm:col-span-3">
        <Submit pending={pending}>Tambah Layanan</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** Admin Platform changes one Layanan's own fields (never its Pilihan). */
export function UbahLayananForm({
  layanan,
}: {
  layanan: { id: string; name: string; description: string; bukti: string; leadTimeDays: number; bisaHariH: boolean; adaDiPetakKosong: boolean; teksLabel: string | null };
}) {
  const [state, action, pending] = useActionState(ubahLayanan, idle);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="layananId" value={layanan.id} />
      <LayananFields defaults={layanan} />
      <div className="flex flex-col gap-2 sm:col-span-3">
        <Submit pending={pending}>Simpan perubahan</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** One Pilihan added to a Layanan. */
export function TambahVarianForm({ layananId }: { layananId: string }) {
  const [state, action, pending] = useActionState(tambahVarian, idle);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="layananId" value={layananId} />
      <Field label="Pilihan baru" name="name" required maxLength={120} placeholder="mis. Marmer 80 cm" />
      <Submit pending={pending}>Tambah</Submit>
      <Feedback state={state} />
    </form>
  );
}

/** One Pilihan removed from the catalog. */
export function HapusVarianForm({ variantId }: { variantId: string }) {
  const [state, action, pending] = useActionState(hapusVarian, idle);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="layananVariantId" value={variantId} />
      <Field label="Alasan (opsional)" name="reason" maxLength={500} />
      <Button type="submit" variant="destructive" disabled={pending}>
        Hapus Pilihan
      </Button>
      <Feedback state={state} />
    </form>
  );
}

/** The hand-set "boleh di TPU DKI" mark on one Pilihan. */
export function TandaiBolehDiTpuForm({ variantId, boleh }: { variantId: string; boleh: boolean }) {
  const [state, action, pending] = useActionState(tandaiBolehDiTpu, idle);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="layananVariantId" value={variantId} />
      <input type="hidden" name="boleh" value={boleh ? "false" : "true"} />
      <Field label="Alasan (opsional)" name="reason" maxLength={500} />
      <Button type="submit" variant="outline" disabled={pending}>
        {boleh ? "Cabut tanda boleh di TPU DKI" : "Tandai boleh di TPU DKI"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}

/** A new DKI price for one Pilihan (the same in every TPU DKI). */
export function HargaDkiForm({ variantId, today }: { variantId: string; today: string }) {
  const [state, action, pending] = useActionState(simpanHargaDki, idle);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="layananVariantId" value={variantId} />
      <RupiahField label="Harga di TPU DKI (Rp)" name="amount" placeholder="600.000" />
      <EffectiveOnAndReason today={today} />
      <div className="flex flex-col gap-2 sm:col-span-3">
        <Submit pending={pending}>Simpan versi harga baru</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** A new Mitra Jasa rate for one Pilihan: what the Operator pays, never shown to a Pemesan. */
export function TarifMitraJasaForm({ variantId, today }: { variantId: string; today: string }) {
  const [state, action, pending] = useActionState(simpanTarifMitraJasa, idle);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="layananVariantId" value={variantId} />
      <RupiahField label="Tarif Mitra Jasa (Rp)" name="amount" placeholder="400.000" />
      <EffectiveOnAndReason today={today} />
      <div className="flex flex-col gap-2 sm:col-span-3">
        <Submit pending={pending}>Simpan versi tarif baru</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** Switch one Pilihan on at a Lokasi Mitra, with that place's price. */
export function TawarkanLayananForm({ lokasiId, variantId, today }: { lokasiId: string; variantId: string; today: string }) {
  const [state, action, pending] = useActionState(tawarkanLayanan, idle);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="layananVariantId" value={variantId} />
      <RupiahField label="Harga di Lokasi Mitra ini (Rp)" name="amount" placeholder="500.000" />
      <EffectiveOnAndReason today={today} />
      <div className="flex flex-col gap-2 sm:col-span-3">
        <Submit pending={pending}>Tawarkan di Lokasi Mitra ini</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** Stop a Lokasi Mitra offering one Pilihan. */
export function StopLayananForm({ lokasiId, variantId }: { lokasiId: string; variantId: string }) {
  const [state, action, pending] = useActionState(stopLayanan, idle);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="layananVariantId" value={variantId} />
      <Field label="Alasan (opsional)" name="reason" maxLength={500} />
      <Button type="submit" variant="destructive" disabled={pending}>
        Berhenti menawarkan
      </Button>
      <Feedback state={state} />
    </form>
  );
}

/** One Pilihan of a Paket Layanan, as a checkbox. */
function PaketItem({ id, label, defaultChecked }: { id: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name="itemIds" value={id} defaultChecked={defaultChecked} className="size-4 accent-primary" />
      {label}
    </label>
  );
}

function PaketFields({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Field label="Nama" name="name" required maxLength={120} placeholder="mis. Paket Ziarah" />
      <TextArea label="Keterangan" name="description" placeholder="Apa saja isinya dan seberapa sering." />
      <Select label="Frekuensi" name="frekuensi" options={frekuensiOptions} defaultValue="bulanan" />
      <div className="flex flex-col gap-2 sm:col-span-3">
        <p className="text-sm font-medium">Isi Paket</p>
        {children}
      </div>
      <input type="hidden" name="reason" value="" />
    </>
  );
}

/** Admin Platform defines a Paket Layanan. */
export function BuatPaketForm({ item }: { item: readonly { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(buatPaket, idle);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <PaketFields>
        {item.map((one) => (
          <PaketItem key={one.id} id={one.id} label={one.label} />
        ))}
      </PaketFields>
      <div className="flex flex-col gap-2 sm:col-span-3">
        <Submit pending={pending}>Tambah Paket Layanan</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** Admin Platform changes a Paket Layanan's items, frequency and wording. */
export function UbahPaketForm({
  paket,
  item,
}: {
  paket: { id: string; name: string; description: string; frekuensi: string; itemIds: readonly string[] };
  item: readonly { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(ubahPaket, idle);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="paketId" value={paket.id} />
      <PaketFields>
        {item.map((one) => (
          <PaketItem key={one.id} id={one.id} label={one.label} defaultChecked={paket.itemIds.includes(one.id)} />
        ))}
      </PaketFields>
      <div className="flex flex-col gap-2 sm:col-span-3">
        <Submit pending={pending}>Simpan perubahan</Submit>
        <Feedback state={state} />
      </div>
    </form>
  );
}

/** Admin Platform removes a Paket Layanan. */
export function HapusPaketForm({ paketId }: { paketId: string }) {
  const [state, action, pending] = useActionState(hapusPaket, idle);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="paketId" value={paketId} />
      <Field label="Alasan (opsional)" name="reason" maxLength={500} />
      <Button type="submit" variant="destructive" disabled={pending}>
        Hapus Paket Layanan
      </Button>
      <Feedback state={state} />
    </form>
  );
}
