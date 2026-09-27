"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState, useId, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { FieldError } from "@/components/makam/form-section";
import { pesanKesalahan } from "@/components/makam/form-errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ServerResult, idleFormState } from "../../form-feedback";
import { useResetAfterSubmit } from "../../form-reset";
import { pulihkanAkun } from "./actions";
import { PEMULIHAN_AKUN_REASON_MAX, pulihkanAkunSchema, type PulihkanAkunInput } from "./schema";

/** The Akun picked by its id (from the staff roster), shown instead of the email field. */
export function PemulihanAkunForm({ akun }: { akun: { id: string; label: string } | null }) {
  const errorPrefix = useId();
  const [state, submit, pending] = useActionState(pulihkanAkun, idleFormState);
  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { errors },
  } = useForm<PulihkanAkunInput>({
    resolver: zodResolver(pulihkanAkunSchema, { error: pesanKesalahan }),
    defaultValues: akun ? { accountId: akun.id, newEmail: "", reason: "" } : { currentEmail: "", newEmail: "", reason: "" },
  });

  // Once the Email Terverifikasi has moved, the form is back to what it started
  // with — including the file input, which `reset` cannot reach — so recovering
  // the next Akun is a new entry, not the same one sent twice.
  const ktpInput = useRef<HTMLInputElement>(null);
  useResetAfterSubmit(
    state,
    () => (akun ? { accountId: akun.id, newEmail: "", reason: "" } : { currentEmail: "", newEmail: "", reason: "" }),
    reset,
    () => {
      if (ktpInput.current) ktpInput.current.value = "";
    },
  );

  const describedBy = (field: keyof PulihkanAkunInput) => (errors[field] ? `${errorPrefix}-${field}` : undefined);

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={handleSubmit((data) => {
        const formData = new FormData();
        if (data.accountId) formData.set("accountId", data.accountId);
        if (data.currentEmail) formData.set("currentEmail", data.currentEmail);
        formData.set("newEmail", data.newEmail);
        formData.set("ktpCheck", data.ktpCheck);
        if (data.ktpChecked) formData.set("ktpChecked", data.ktpChecked);
        formData.set("reason", data.reason);
        startTransition(() => submit(formData));
      })}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {akun ? (
          <p className="flex flex-col gap-1 text-sm font-medium">
            Akun yang dipulihkan
            <span className="font-normal" data-testid="pemulihan-akun-terpilih">
              {akun.label}
            </span>
            <input type="hidden" {...register("accountId")} />
          </p>
        ) : (
          <label className="flex flex-col gap-1 text-sm font-medium">
            Email Akun sekarang
            <Input
              {...register("currentEmail")}
              type="email"
              placeholder="nama@contoh.id"
              aria-invalid={errors.currentEmail ? true : undefined}
              aria-describedby={describedBy("currentEmail")}
              className="h-10 px-3"
            />
            <FieldError id={describedBy("currentEmail")} message={errors.currentEmail?.message} />
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm font-medium">
          Email baru
          <Input
            {...register("newEmail")}
            type="email"
            placeholder="nama.baru@contoh.id"
            aria-invalid={errors.newEmail ? true : undefined}
            aria-describedby={describedBy("newEmail")}
            className="h-10 px-3"
          />
          <FieldError id={describedBy("newEmail")} message={errors.newEmail?.message} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Foto atau scan KTP
        <input
          ref={ktpInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          aria-invalid={errors.ktpCheck ? true : undefined}
          aria-describedby={describedBy("ktpCheck")}
          className="text-sm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            setValue("ktpCheck", file as File, { shouldValidate: true });
          }}
        />
        <FieldError id={describedBy("ktpCheck")} message={errors.ktpCheck?.message} />
      </label>
      <Controller
        name="ktpChecked"
        control={control}
        render={({ field }) => (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={field.value === "ya"}
              onBlur={field.onBlur}
              aria-invalid={errors.ktpChecked ? true : undefined}
              aria-describedby={describedBy("ktpChecked")}
              onChange={(event) => field.onChange(event.target.checked ? "ya" : undefined)}
            />
            KTP sudah dicek: cocok dengan data Akun
          </label>
        )}
      />
      <FieldError id={describedBy("ktpChecked")} message={errors.ktpChecked?.message} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Alasan
        <Input
          {...register("reason")}
          maxLength={PEMULIHAN_AKUN_REASON_MAX}
          aria-invalid={errors.reason ? true : undefined}
          aria-describedby={describedBy("reason")}
          className="h-10 px-3"
        />
        <FieldError id={describedBy("reason")} message={errors.reason?.message} />
      </label>
      <Button type="submit" disabled={pending} className="self-start">
        Pulihkan Akun
      </Button>
      <ServerResult state={state} />
    </form>
  );
}
