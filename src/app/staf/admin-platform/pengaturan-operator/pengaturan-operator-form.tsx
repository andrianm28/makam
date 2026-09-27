"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState, useId } from "react";
import { useForm } from "react-hook-form";
import { FieldError } from "@/components/makam/form-section";
import { pesanKesalahan } from "@/components/makam/form-errors";
import { Button } from "@/components/ui/button";
import type { OperatorSettingsEntry, OperatorSettingsField } from "@/domain/operator-settings";
import { ServerResult, idleFormState } from "../../form-feedback";
import { simpanPengaturanOperator, type PengaturanOperatorFormState } from "./actions";
import { pengaturanOperatorSchema, type PengaturanOperatorInput } from "./schema";

const inputClass =
  "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

const fieldLabels: Record<OperatorSettingsField | "reason", string> = {
  legalName: "Nama resmi Operator",
  address: "Alamat terdaftar",
  phone: "Telepon Operator",
  email: "Email Operator",
  csWhatsApp: "Nomor WhatsApp CS",
  csReplyHours: "Jam balas CS",
  reason: "Alasan perubahan (opsional)",
};

/** `values`: what the form starts with, those in force or empty before the first entry. */
export function PengaturanOperatorForm({ values }: { values: OperatorSettingsEntry }) {
  const errorPrefix = useId();
  const [state, submit, pending] = useActionState<PengaturanOperatorFormState, FormData>(
    simpanPengaturanOperator,
    idleFormState,
  );
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PengaturanOperatorInput>({
    resolver: zodResolver(pengaturanOperatorSchema, { error: pesanKesalahan }),
    defaultValues: { ...values, reason: "" },
  });

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
        <input {...field("legalName")} maxLength={200} className={inputClass} />
        <FieldError id={errorId("legalName")} message={errors.legalName?.message} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {fieldLabels.address}
        <textarea
          {...field("address")}
          maxLength={500}
          rows={3}
          className="rounded-lg border border-input bg-background px-3 py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <FieldError id={errorId("address")} message={errors.address?.message} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          {fieldLabels.phone}
          <input {...field("phone")} type="tel" maxLength={32} className={inputClass} />
          <FieldError id={errorId("phone")} message={errors.phone?.message} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {fieldLabels.email}
          <input {...field("email")} type="email" maxLength={254} className={inputClass} />
          <FieldError id={errorId("email")} message={errors.email?.message} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {fieldLabels.csWhatsApp}
          <input {...field("csWhatsApp")} type="tel" inputMode="tel" maxLength={32} className={inputClass} />
          <FieldError id={errorId("csWhatsApp")} message={errors.csWhatsApp?.message} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {fieldLabels.csReplyHours}
          <input
            {...field("csReplyHours")}
            maxLength={200}
            placeholder="dibalas mulai pukul 06:00"
            className={inputClass}
          />
          <FieldError id={errorId("csReplyHours")} message={errors.csReplyHours?.message} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {fieldLabels.reason}
        <input {...field("reason")} maxLength={500} className={inputClass} />
        <FieldError id={errorId("reason")} message={errors.reason?.message} />
      </label>
      <Button type="submit" disabled={pending} className="self-start">
        Simpan
      </Button>
      <ServerResult state={state} />
    </form>
  );
}
