"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState, useId } from "react";
import { useForm } from "react-hook-form";
import { FieldError } from "@/components/makam/form-section";
import { pesanKesalahan } from "@/components/makam/form-errors";
import { Button } from "@/components/ui/button";
import type { OperatorSettingsEntry } from "@/domain/operator-settings";
import { operatorSettingsFieldLabels } from "@/lib/operator-settings-labels";
import { ServerResult, idleFormState } from "../../form-feedback";
import { useResetAfterSubmit } from "../../form-reset";
import { simpanPengaturanOperator } from "./actions";
import { pengaturanOperatorLimits, pengaturanOperatorSchema, type PengaturanOperatorInput } from "./schema";

const inputClass =
  "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** The reason is this form's own field, not one of the Operator's values. */
const fieldLabels = { ...operatorSettingsFieldLabels, reason: "Alasan perubahan (opsional)" };

/** `values`: what the form starts with, those in force or empty before the first entry. */
export function PengaturanOperatorForm({ values }: { values: OperatorSettingsEntry }) {
  const errorPrefix = useId();
  const [state, submit, pending] = useActionState(simpanPengaturanOperator, idleFormState);
  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { errors },
  } = useForm<PengaturanOperatorInput>({
    resolver: zodResolver(pengaturanOperatorSchema, { error: pesanKesalahan }),
    defaultValues: { ...values, reason: "" },
  });

  // Once the save went through the fields show the values that are now in force —
  // the ones this form just sent, with the reason of that one change cleared — and
  // a refusal leaves everything as it is for the one fix.
  useResetAfterSubmit(state, () => ({ ...getValues(), reason: "" }), reset);

  const errorId = (field: keyof PengaturanOperatorInput) => `${errorPrefix}-${field}`;
  const field = (name: keyof PengaturanOperatorInput) => ({
    ...register(name),
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? errorId(name) : undefined,
  });

  return (
    <form
      data-testid="pengaturan-operator-form"
      noValidate
      className="flex flex-col gap-3"
      onSubmit={handleSubmit((data) => {
        const formData = new FormData();
        for (const [name, value] of Object.entries(data)) formData.set(name, value);
        startTransition(() => submit(formData));
      })}
    >
      <label className="flex flex-col gap-1 text-sm font-medium">
        {fieldLabels.legalName}
        <input {...field("legalName")} maxLength={pengaturanOperatorLimits.legalName} className={inputClass} />
        <FieldError id={errorId("legalName")} message={errors.legalName?.message} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {fieldLabels.address}
        <textarea
          {...field("address")}
          maxLength={pengaturanOperatorLimits.address}
          rows={3}
          className="rounded-lg border border-input bg-background px-3 py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <FieldError id={errorId("address")} message={errors.address?.message} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          {fieldLabels.phone}
          <input
            {...field("phone")}
            type="tel"
            maxLength={pengaturanOperatorLimits.phone}
            className={inputClass}
          />
          <FieldError id={errorId("phone")} message={errors.phone?.message} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {fieldLabels.email}
          <input {...field("email")} type="email" maxLength={pengaturanOperatorLimits.email} className={inputClass} />
          <FieldError id={errorId("email")} message={errors.email?.message} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {fieldLabels.csWhatsApp}
          <input
            {...field("csWhatsApp")}
            type="tel"
            inputMode="tel"
            maxLength={pengaturanOperatorLimits.csWhatsApp}
            className={inputClass}
          />
          <FieldError id={errorId("csWhatsApp")} message={errors.csWhatsApp?.message} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {fieldLabels.csReplyHours}
          <input
            {...field("csReplyHours")}
            maxLength={pengaturanOperatorLimits.csReplyHours}
            placeholder="dibalas mulai pukul 06:00"
            className={inputClass}
          />
          <FieldError id={errorId("csReplyHours")} message={errors.csReplyHours?.message} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {fieldLabels.reason}
        <input {...field("reason")} maxLength={pengaturanOperatorLimits.reason} className={inputClass} />
        <FieldError id={errorId("reason")} message={errors.reason?.message} />
      </label>
      <Button type="submit" disabled={pending} className="self-start">
        Simpan
      </Button>
      <ServerResult state={state} />
    </form>
  );
}
