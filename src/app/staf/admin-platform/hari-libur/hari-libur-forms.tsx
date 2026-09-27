"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState, useId } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FieldError } from "@/components/makam/form-section";
import { pesanKesalahan } from "@/components/makam/form-errors";
import { Button } from "@/components/ui/button";
import { hariLiburNasionalSchema } from "@/domain/lokasi";
import { ServerResult, idleFormState } from "../../form-feedback";
import { hapusHariLibur, tambahHariLibur } from "./actions";
import { hapusHariLiburSchema, type HapusHariLiburInput } from "./schema";

const inputClass =
  "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

type TambahHariLiburInput = z.infer<typeof hariLiburNasionalSchema>;

/** Adds one Hari Libur Nasional to the list. */
export function AddHariLiburForm() {
  const errorPrefix = useId();
  const [state, submit, pending] = useActionState(tambahHariLibur, idleFormState);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TambahHariLiburInput>({
    resolver: zodResolver(hariLiburNasionalSchema, { error: pesanKesalahan }),
    defaultValues: { date: "", name: "" },
  });

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
          maxLength={120}
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
  const { register, handleSubmit } = useForm<HapusHariLiburInput>({
    resolver: zodResolver(hapusHariLiburSchema, { error: pesanKesalahan }),
    defaultValues: { date, reason: "" },
  });

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
