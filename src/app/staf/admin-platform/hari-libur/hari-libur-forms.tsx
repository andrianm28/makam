"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState, useId } from "react";
import { useForm } from "react-hook-form";
import { FieldError } from "@/components/makam/form-section";
import { pesanKesalahan } from "@/components/makam/form-errors";
import { Button } from "@/components/ui/button";
import { HARI_LIBUR_NASIONAL_NAME_MAX, hariLiburNasionalSchema, hapusHariLiburSchema } from "@/domain/lokasi";
import type { HariLiburNasionalInput, HapusHariLiburInput } from "@/domain/lokasi";
import { ServerResult, idleFormState } from "../../form-feedback";
import { useResetAfterSubmit } from "../../form-reset";
import { hapusHariLibur, tambahHariLibur } from "./actions";

const inputClass =
  "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** The form starts empty: each Hari Libur Nasional is one entry, and a saved one is on the list already. */
const kosong: HariLiburNasionalInput = { date: "", name: "" };

/** Adds one Hari Libur Nasional to the list. */
export function AddHariLiburForm() {
  const errorPrefix = useId();
  const [state, submit, pending] = useActionState(tambahHariLibur, idleFormState);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<HariLiburNasionalInput>({
    resolver: zodResolver(hariLiburNasionalSchema, { error: pesanKesalahan }),
    defaultValues: kosong,
  });
  useResetAfterSubmit(state, () => kosong, reset);

  return (
    <form
      noValidate
      className="flex flex-wrap items-end gap-3"
      onSubmit={handleSubmit((data) => {
        const formData = new FormData();
        formData.set("date", data.date);
        formData.set("name", data.name);
        startTransition(() => submit(formData));
      })}
    >
      <label className="flex flex-col gap-1 text-sm font-medium">
        Tanggal
        <input
          {...register("date")}
          type="date"
          aria-invalid={errors.date ? true : undefined}
          aria-describedby={errors.date ? `${errorPrefix}-date` : undefined}
          className={inputClass}
        />
        <FieldError id={`${errorPrefix}-date`} message={errors.date?.message} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nama hari libur
        <input
          {...register("name")}
          maxLength={HARI_LIBUR_NASIONAL_NAME_MAX}
          placeholder="Hari Raya Natal"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${errorPrefix}-name` : undefined}
          className={inputClass}
        />
        <FieldError id={`${errorPrefix}-name`} message={errors.name?.message} />
      </label>
      <Button type="submit" disabled={pending}>
        Tambah
      </Button>
      <div className="basis-full">
        <ServerResult state={state} />
      </div>
    </form>
  );
}

/** Removes one Hari Libur Nasional from the list. */
export function RemoveHariLiburForm({ date }: { date: string }) {
  const [state, submit, pending] = useActionState(hapusHariLibur, idleFormState);
  const { register, handleSubmit, reset } = useForm<HapusHariLiburInput>({
    resolver: zodResolver(hapusHariLiburSchema, { error: pesanKesalahan }),
    defaultValues: { date, reason: "" },
  });
  // The row leaves the list after the save; until it does, its form is back to
  // no reason at all, so a second click is not a second removal.
  useResetAfterSubmit(state, () => ({ date, reason: "" }), reset);

  return (
    <form
      noValidate
      className="flex items-center gap-2"
      onSubmit={handleSubmit((data) => {
        const formData = new FormData();
        formData.set("date", data.date);
        formData.set("reason", data.reason);
        startTransition(() => submit(formData));
      })}
    >
      <input type="hidden" {...register("date")} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        Hapus
      </Button>
      <ServerResult state={state} />
    </form>
  );
}
