"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState } from "react";
import { useForm } from "react-hook-form";
import { FieldError } from "@/components/makam/form-section";
import { pesanKesalahan } from "@/components/makam/form-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// The schemas come from the Layanan module's own schema file, never from its
// barrel: a client component must not reach the database through one (AGENTS.md).
import {
  profilMitraJasaSchema,
  rekeningMitraJasaSchema,
  statusMitraJasaSchema,
  tidakTersediaSchema,
} from "@/domain/layanan/mitra-jasa-skema";
import { ServerResult, idleFormState } from "../../form-feedback";
import { HapusRangeForm } from "./hapus-range-form";
import { useResetAfterSubmit } from "../../form-reset";
import {
  buatMitraJasa,
  catatTinjauan,
  simpanCoverage,
  simpanProfil,
  simpanRekening,
  simpanStatus,
  tambahTidakTersedia,
  unggahBerkas,
} from "./actions";

const label = "flex flex-col gap-1 text-sm font-medium";
const kosongProfil: ProfilTerisi = { namaLengkap: "", nik: "", area: "", kontakSiagaNama: null, kontakSiagaTelepon: null };
/**
 * What these two forms hold: each schema's *input*, where a blank reason is
 * optional. React Hook Form types a form by its input, and the output is what the
 * module parses.
 */
type RentangTerisi = { dari: string; sampai: string; alasan?: string | null };
type StatusTerisi = { status: "aktif" | "ditangguhkan" | "berhenti"; alasan?: string | null };
type RekeningTerisi = { bankName: string; accountNumber: string; accountHolder: string; catatanOverride?: string | null };
type ProfilTerisi = { namaLengkap: string; nik: string; area: string; kontakSiagaNama?: string | null; kontakSiagaTelepon?: string | null };
const kosong: RentangTerisi = { dari: "", sampai: "", alasan: null };

/** The FormData a form hands its Server Action, field by field. */
function isi(values: Record<string, string | number | null | undefined>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && value !== "") data.set(name, String(value));
  }
  return data;
}

/** Admin Platform starts a Mitra Jasa's onboarding record: the profile, and the email the Undangan Staf goes to. */
export function BuatMitraJasaForm() {
  const [state, submit, pending] = useActionState(buatMitraJasa, idleFormState);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfilTerisi>({
    resolver: zodResolver(profilMitraJasaSchema, { error: pesanKesalahan }),
    defaultValues: kosongProfil,
    mode: "onBlur",
  });
  useResetAfterSubmit(
    state,
    () => kosongProfil,
    (values) => reset(values),
  );

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={handleSubmit((_data, event) => {
        // Every field, including the two the invite carries, is named, so the form's own
        // FormData is the whole input; the Server Action validates all of it.
        startTransition(() => submit(new FormData(event?.currentTarget as HTMLFormElement)));
      })}
    >
      <label className={label}>
        Email (alamat Undangan Staf)
        <Input type="email" name="email" />
      </label>
      <label className={label}>
        Nomor telepon (kontak)
        <Input type="tel" name="nomorTelepon" inputMode="tel" placeholder="08xxxxxxxxxx" />
      </label>
      <label className={label}>
        Nama lengkap (menurut KTP)
        <Input {...register("namaLengkap")} aria-invalid={errors.namaLengkap ? true : undefined} />
        <FieldError message={errors.namaLengkap?.message} />
      </label>
      <label className={label}>
        NIK
        <Input {...register("nik")} inputMode="numeric" maxLength={16} aria-invalid={errors.nik ? true : undefined} />
        <FieldError message={errors.nik?.message} />
      </label>
      <label className={label}>
        Area tempat tinggal
        <Input {...register("area")} aria-invalid={errors.area ? true : undefined} />
        <FieldError message={errors.area?.message} />
      </label>
      <Button type="submit" disabled={pending}>
        Tambah Mitra Jasa
      </Button>
      <ServerResult state={state} />
    </form>
  );
}

/** The profile: name, NIK, home area and the optional emergency contact. */
export function ProfilForm({ mitraJasaId, nilai }: { mitraJasaId: string; nilai: ProfilTerisi }) {
  const [state, submit, pending] = useActionState(simpanProfil, idleFormState);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfilTerisi>({
    resolver: zodResolver(profilMitraJasaSchema, { error: pesanKesalahan }),
    defaultValues: nilai,
  });
  useResetAfterSubmit(
    state,
    () => nilai,
    (values) => reset(values),
  );

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={handleSubmit((data) => startTransition(() => submit(isi({ ...data, mitraJasaId }))))}
    >
      <label className={label}>
        Nama lengkap (menurut KTP)
        <Input {...register("namaLengkap")} aria-invalid={errors.namaLengkap ? true : undefined} />
        <FieldError message={errors.namaLengkap?.message} />
      </label>
      <label className={label}>
        NIK
        <Input {...register("nik")} inputMode="numeric" maxLength={16} aria-invalid={errors.nik ? true : undefined} />
        <FieldError message={errors.nik?.message} />
      </label>
      <label className={label}>
        Area tempat tinggal
        <Input {...register("area")} aria-invalid={errors.area ? true : undefined} />
        <FieldError message={errors.area?.message} />
      </label>
      <p className="text-small text-muted-foreground">Kontak siaga opsional.</p>
      <label className={label}>
        Nama kontak siaga
        <Input {...register("kontakSiagaNama")} aria-invalid={errors.kontakSiagaNama ? true : undefined} />
        <FieldError message={errors.kontakSiagaNama?.message} />
      </label>
      <label className={label}>
        Nomor kontak siaga
        <Input {...register("kontakSiagaTelepon")} inputMode="tel" aria-invalid={errors.kontakSiagaTelepon ? true : undefined} />
        <FieldError message={errors.kontakSiagaTelepon?.message} />
      </label>
      <Button type="submit" disabled={pending}>
        Simpan profil
      </Button>
      <ServerResult state={state} />
    </form>
  );
}

/** The bank account, with the one rule that may refuse it: the name is the KTP's, or there is an override note. */
export function RekeningForm({
  mitraJasaId,
  nilai,
  namaKtp,
}: {
  mitraJasaId: string;
  nilai: RekeningTerisi;
  namaKtp: string;
}) {
  const [state, submit, pending] = useActionState(simpanRekening, idleFormState);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RekeningTerisi>({
    resolver: zodResolver(rekeningMitraJasaSchema, { error: pesanKesalahan }),
    defaultValues: nilai,
  });
  useResetAfterSubmit(
    state,
    () => nilai,
    (values) => reset(values),
  );

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={handleSubmit((data) => startTransition(() => submit(isi({ ...data, mitraJasaId }))))}
    >
      <p className="text-small text-muted-foreground">
        Nama pemilik rekening harus sama dengan nama di KTP: <strong>{namaKtp}</strong>. Kalau berbeda, isi catatan override.
      </p>
      <label className={label}>
        Nama bank
        <Input {...register("bankName")} aria-invalid={errors.bankName ? true : undefined} />
        <FieldError message={errors.bankName?.message} />
      </label>
      <label className={label}>
        Nomor rekening
        <Input {...register("accountNumber")} inputMode="numeric" aria-invalid={errors.accountNumber ? true : undefined} />
        <FieldError message={errors.accountNumber?.message} />
      </label>
      <label className={label}>
        Nama pemilik rekening
        <Input {...register("accountHolder")} aria-invalid={errors.accountHolder ? true : undefined} />
        <FieldError message={errors.accountHolder?.message} />
      </label>
      <label className={label}>
        Catatan override
        <Input {...register("catatanOverride")} aria-invalid={errors.catatanOverride ? true : undefined} />
        <FieldError message={errors.catatanOverride?.message} />
      </label>
      <Button type="submit" disabled={pending}>
        Simpan rekening
      </Button>
      <ServerResult state={state} />
    </form>
  );
}

/** One file: the KTP photo, the Mitra Jasa's photo, or the signed arrangement scan. */
export function BerkasForm({
  mitraJasaId,
  jenis,
  sudah,
  tanggalDitandatangani,
}: {
  mitraJasaId: string;
  jenis: "ktp" | "foto" | "perjanjian";
  sudah: boolean;
  tanggalDitandatangani?: string | null;
}) {
  const [state, submit, pending] = useActionState(unggahBerkas, idleFormState);
  const { register, reset } = useForm<{ file: FileList; signedOn: string }>({
    defaultValues: { signedOn: tanggalDitandatangani ?? "" },
  });
  useResetAfterSubmit(
    state,
    () => undefined,
    () => reset(),
  );

  return (
    <form
      noValidate
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        data.set("mitraJasaId", mitraJasaId);
        data.set("jenis", jenis);
        startTransition(() => submit(data));
      }}
    >
      <label className={label}>
        Berkas
        <input type="file" {...register("file")} accept="image/jpeg,image/png,application/pdf" className="text-sm" />
      </label>
      {jenis === "perjanjian" ? (
        <label className={label}>
          Tanggal ditandatangani
          <Input type="date" {...register("signedOn")} />
        </label>
      ) : null}
      <Button type="submit" variant="outline" disabled={pending}>
        {sudah ? "Ganti berkas" : "Unggah"}
      </Button>
      <div className="basis-full">
        <ServerResult state={state} />
      </div>
    </form>
  );
}

/** The coverage lists: which DKI TPUs and which Layanan variants this Mitra Jasa may be given work at. */
export function CoverageForm({
  mitraJasaId,
  tpuOptions,
  layananOptions,
  nilai,
}: {
  mitraJasaId: string;
  tpuOptions: { id: string; name: string }[];
  layananOptions: { id: string; name: string; layanan: string }[];
  nilai: { tpuDkiIds: string[]; layananVariantIds: string[] };
}) {
  const [state, submit, pending] = useActionState(simpanCoverage, idleFormState);
  const { register, reset } = useForm();
  useResetAfterSubmit(
    state,
    () => undefined,
    () => reset(nilai),
  );

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const satu = (name: string) => data.getAll(name).map(String);
        startTransition(() =>
          submit(
            isi({
              mitraJasaId,
              tpuDkiIds: satu("tpuDkiIds").join("\n"),
              layananVariantIds: satu("layananVariantIds").join("\n"),
            }),
          ),
        );
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">TPU DKI yang dilayani</legend>
        {tpuOptions.length === 0 ? (
          <p className="text-small text-muted-foreground">Belum ada TPU DKI di daftar.</p>
        ) : (
          tpuOptions.map((satu) => (
            <label key={satu.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register("tpuDkiIds")} value={satu.id} defaultChecked={nilai.tpuDkiIds.includes(satu.id)} />
              {satu.name}
            </label>
          ))
        )}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Layanan yang dilayani</legend>
        {layananOptions.length === 0 ? (
          <p className="text-small text-muted-foreground">Katalog Layanan masih kosong.</p>
        ) : (
          layananOptions.map((satu) => (
            <label key={satu.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                {...register("layananVariantIds")}
                value={satu.id}
                defaultChecked={nilai.layananVariantIds.includes(satu.id)}
              />
              {satu.layanan} — {satu.name}
            </label>
          ))
        )}
      </fieldset>
      <Button type="submit" disabled={pending}>
        Simpan daftar dilayani
      </Button>
      <ServerResult state={state} />
    </form>
  );
}

/** Admin Platform sets Aktif, Ditangguhan or Berhenti, with the reason a suspension or an ending needs. */
export function StatusForm({ mitraJasaId, status }: { mitraJasaId: string; status: StatusTerisi["status"] }) {
  const [state, submit, pending] = useActionState(simpanStatus, idleFormState);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<StatusTerisi>({
    resolver: zodResolver(statusMitraJasaSchema, { error: pesanKesalahan }),
    defaultValues: { status, alasan: null },
  });
  useResetAfterSubmit(
    state,
    () => ({ status, alasan: null }),
    (values) => reset(values),
  );

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={handleSubmit((data) => startTransition(() => submit(isi({ ...data, mitraJasaId }))))}
    >
      <label className={label}>
        Status
        <select {...register("status")} className="h-10 rounded-lg border border-input bg-background px-3">
          <option value="aktif">Aktif</option>
          <option value="ditangguhkan">Ditangguhkan</option>
          <option value="berhenti">Berhenti</option>
        </select>
      </label>
      <label className={label}>
        Alasan
        <Input {...register("alasan")} aria-invalid={errors.alasan ? true : undefined} />
        <FieldError message={errors.alasan?.message} />
      </label>
      <p className="text-small text-muted-foreground">
        Menangguhkan atau mengakhiri melepas setiap pekerjaan terjadwal milik Mitra Jasa ini, dan pekerjaan yang sedang
        berjalan dikembalikan ke Antrean untuk ditugaskan ulang.
      </p>
      <Button type="submit" disabled={pending}>
        Simpan status
      </Button>
      <ServerResult state={state} />
    </form>
  );
}

/** Admin Platform records the monthly scorecard review, which closes that month's Antrean row. */
export function TinjauanForm({ mitraJasaId, tinjauanId, bulan }: { mitraJasaId: string; tinjauanId: string; bulan: string }) {
  const [state, submit, pending] = useActionState(catatTinjauan, idleFormState);
  const { register, reset } = useForm();
  useResetAfterSubmit(
    state,
    () => undefined,
    () => reset(),
  );

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        data.set("mitraJasaId", mitraJasaId);
        data.set("tinjauanId", tinjauanId);
        startTransition(() => submit(data));
      }}
    >
      <label className={label}>
        Catatan tinjauan {bulan}
        <textarea {...register("catatan")} rows={3} maxLength={500} className="rounded-lg border border-input bg-background px-3 py-2" />
      </label>
      <Button type="submit" disabled={pending}>
        Catat tinjauan
      </Button>
      <ServerResult state={state} />
    </form>
  );
}

/** A Mitra Jasa's own "Tidak tersedia" ranges, kept from the Pekerjaan page. */
export function TidakTersediaForm({ ranges }: { ranges: { id: string; dari: string; sampai: string; alasan: string | null }[] }) {
  const [state, submit, pending] = useActionState(tambahTidakTersedia, idleFormState);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RentangTerisi>({
    resolver: zodResolver(tidakTersediaSchema, { error: pesanKesalahan }),
    defaultValues: kosong,
  });
  useResetAfterSubmit(state, () => kosong, reset);

  return (
    <div className="flex flex-col gap-3">
      <form
        noValidate
        className="flex flex-wrap items-end gap-3"
        onSubmit={handleSubmit((data) => startTransition(() => submit(isi(data))))}
      >
        <label className={label}>
          Dari tanggal
          <Input type="date" {...register("dari")} aria-invalid={errors.dari ? true : undefined} />
          <FieldError message={errors.dari?.message} />
        </label>
        <label className={label}>
          Sampai tanggal
          <Input type="date" {...register("sampai")} aria-invalid={errors.sampai ? true : undefined} />
          <FieldError message={errors.sampai?.message} />
        </label>
        <label className={label}>
          Alasan (opsional)
          <Input {...register("alasan")} />
        </label>
        <Button type="submit" disabled={pending}>
          Tambah
        </Button>
      </form>
      <ServerResult state={state} />
      {ranges.length === 0 ? (
        <p className="text-small text-muted-foreground">Belum ada rentang Tidak tersedia.</p>
      ) : (
        <ul className="flex flex-col divide-y text-small">
          {ranges.map((range) => (
            <li key={range.id} className="flex items-center justify-between gap-2 py-2">
              <span className="font-mono">
                {range.dari} – {range.sampai}
              </span>
              <HapusRangeForm rangeId={range.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
