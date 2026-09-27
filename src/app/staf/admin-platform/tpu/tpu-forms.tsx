"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState, useId } from "react";
import { useForm, type UseFormRegister } from "react-hook-form";
import { z } from "zod";
import { FieldError } from "@/components/makam/form-section";
import { pesanKesalahan } from "@/components/makam/form-errors";
import { Button } from "@/components/ui/button";
import { TPU_LIMITS, type TpuDki } from "@/domain/lokasi";
import { ServerResult, idleFormState } from "../../form-feedback";
import { useResetAfterSubmit } from "../../form-reset";
import { simpanProfilTpu, simpanStatusTpu, tambahTpu } from "./actions";
import { newTpuFormSchema, tpuFlagFormSchema, tpuProfileFormSchema, type TpuFlagForm, type TpuProfileForm } from "./schema";

const inputClass =
  "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** A new TPU's form: its profile, plus the new-plot status as found today. */
type TambahForm = TpuProfileForm & { menerimaMakamBaru: TpuFlagForm };

/** The empty form a new TPU starts from. */
const kosong: TambahForm = {
  name: "",
  address: "",
  city: "",
  dataSource: "",
  pinLat: "",
  pinLng: "",
  menerimaMakamBaru: "ya",
};

/** One TPU's profile as the edit form holds it. */
function formValuesOf(tpu: TpuDki): TpuProfileForm {
  return {
    name: tpu.name,
    address: tpu.address,
    city: tpu.city,
    dataSource: tpu.dataSource,
    pinLat: tpu.pin ? String(tpu.pin.lat) : "",
    pinLng: tpu.pin ? String(tpu.pin.lng) : "",
  };
}

function toFormData(values: Record<string, string>) {
  const formData = new FormData();
  for (const [name, value] of Object.entries(values)) formData.set(name, value);
  return formData;
}

/**
 * Registers one of the profile's fields, whichever form this group sits in: the
 * add form holds one field more than the edit form, so it takes the two shapes
 * by the one thing they share.
 */
type ProfilRegister = UseFormRegister<TpuProfileForm>;
/** The profile's own field errors, in whichever form they sit. */
type ProfilErrors = Partial<Record<keyof TpuProfileForm, { message?: string }>>;

function ProfilFields({ register, errors, prefix }: { register: ProfilRegister; errors: ProfilErrors; prefix: string }) {
  return (
    <>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nama TPU
        <input
          {...register("name")}
          maxLength={TPU_LIMITS.name}
          placeholder="TPU Kober"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${prefix}-name` : undefined}
          className={inputClass}
        />
        <FieldError id={`${prefix}-name`} message={errors.name?.message} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Alamat
        <input
          {...register("address")}
          placeholder="Jl. TPU No. 1, Jakarta Timur"
          aria-invalid={errors.address ? true : undefined}
          aria-describedby={errors.address ? `${prefix}-address` : undefined}
          className={inputClass}
        />
        <FieldError id={`${prefix}-address`} message={errors.address?.message} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Kota / kabupaten
        <input
          {...register("city")}
          placeholder="Kota Jakarta Timur"
          aria-invalid={errors.city ? true : undefined}
          aria-describedby={errors.city ? `${prefix}-city` : undefined}
          className={inputClass}
        />
        <FieldError id={`${prefix}-city`} message={errors.city?.message} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Sumber data
        <input
          {...register("dataSource")}
          placeholder="Dinas Pengguna Umum dan Prasarana"
          aria-invalid={errors.dataSource ? true : undefined}
          aria-describedby={errors.dataSource ? `${prefix}-dataSource` : undefined}
          className={inputClass}
        />
        <FieldError id={`${prefix}-dataSource`} message={errors.dataSource?.message} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Latitude (boleh kosong)
        <input {...register("pinLat")} inputMode="decimal" placeholder="-6,2" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Longitude (boleh kosong)
        <input {...register("pinLng")} inputMode="decimal" placeholder="106,9" className={inputClass} />
      </label>
    </>
  );
}

/** Registers the new-plot choice, from whichever of the two forms holds it. */
type FlagRegister = UseFormRegister<{ menerimaMakamBaru: TpuFlagForm }>;

/** The "menerima makam baru" choice, as both TPU forms show it. */
function MenerimaMakamBaruField({ register }: { register: FlagRegister }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      Menerima makam baru?
      <select {...register("menerimaMakamBaru")} className={inputClass}>
        <option value="ya">Ya</option>
        <option value="tidak">Tidak</option>
      </select>
    </label>
  );
}

/** Admin Platform adds one DKI TPU, with the new-plot status as found today. */
export function AddTpuForm() {
  const prefix = useId();
  const [state, submit, pending] = useActionState(tambahTpu, idleFormState);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TambahForm>({
    resolver: zodResolver(newTpuFormSchema, { error: pesanKesalahan }),
    defaultValues: kosong,
  });
  useResetAfterSubmit(state, () => kosong, reset);

  return (
    <form
      noValidate
      className="flex flex-wrap items-end gap-3"
      onSubmit={handleSubmit((data) => startTransition(() => submit(toFormData(data))))}
    >
      <ProfilFields register={register} errors={errors} prefix={prefix} />
      <MenerimaMakamBaruField register={register} />
      <Button type="submit" disabled={pending}>
        Tambah
      </Button>
      <div className="basis-full">
        <ServerResult state={state} />
      </div>
    </form>
  );
}

/** Admin Platform corrects one TPU's name, address, city, pin or data source. */
export function TpuProfileForm({ tpu }: { tpu: TpuDki }) {
  const prefix = useId();
  const [state, submit, pending] = useActionState(simpanProfilTpu, idleFormState);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TpuProfileForm>({
    resolver: zodResolver(tpuProfileFormSchema, { error: pesanKesalahan }),
    defaultValues: formValuesOf(tpu),
  });
  // A saved profile stays on the page, so the form goes back to what the TPU now says.
  useResetAfterSubmit(state, () => formValuesOf(tpu), reset);

  return (
    <form
      noValidate
      className="flex flex-wrap items-end gap-3"
      onSubmit={handleSubmit((data) => startTransition(() => submit(toFormData({ ...data, tpuId: tpu.id }))))}
    >
      <ProfilFields register={register} errors={errors} prefix={prefix} />
      <Button type="submit" disabled={pending}>
        Simpan profil
      </Button>
      <div className="basis-full">
        <ServerResult state={state} />
      </div>
    </form>
  );
}

/**
 * Admin Platform records what this TPU takes today, which is also what stamps
 * the date the Antrean's "Cek status TPU" row counts its 14 days from.
 */
export function TpuStatusForm({ tpu }: { tpu: TpuDki }) {
  const [state, submit, pending] = useActionState(simpanStatusTpu, idleFormState);
  const values = { menerimaMakamBaru: (tpu.menerimaMakamBaru ? "ya" : "tidak") as TpuFlagForm };
  const { register, handleSubmit, reset } = useForm<{ menerimaMakamBaru: TpuFlagForm }>({
    resolver: zodResolver(z.object({ menerimaMakamBaru: tpuFlagFormSchema }), { error: pesanKesalahan }),
    defaultValues: values,
  });
  useResetAfterSubmit(state, () => values, reset);

  return (
    <form
      noValidate
      className="flex flex-wrap items-end gap-3"
      onSubmit={handleSubmit((data) =>
        startTransition(() => submit(toFormData({ ...data, tpuId: tpu.id, nama: tpu.name }))),
      )}
    >
      <MenerimaMakamBaruField register={register} />
      <Button type="submit" disabled={pending}>
        Simpan status
      </Button>
      <div className="basis-full">
        <ServerResult state={state} />
      </div>
    </form>
  );
}
