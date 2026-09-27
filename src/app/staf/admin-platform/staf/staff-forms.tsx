"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { startTransition, useActionState, useId } from "react";
import { useForm } from "react-hook-form";
import { FieldError } from "@/components/makam/form-section";
import { pesanKesalahan } from "@/components/makam/form-errors";
import { Button } from "@/components/ui/button";
import { ServerResult, idleFormState } from "../../form-feedback";
import { useResetAfterSubmit } from "../../form-reset";
import { nonaktifkanStaf, undangStaf } from "./actions";
import {
  STAF_REASON_MAX,
  nonaktifkanStafSchema,
  undangStafSchema,
  type NonaktifkanStafInput,
  type UndangStafInput,
} from "./schema";
import type { RoleOption } from "./undangan-peran";

const inputClass =
  "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Undangan Staf: the email it is addressed to, a phone number as contact, one
 * role. `roles` and `defaultRole` come from the page, which asks the domain
 * which roles it may hand out (`roleUndangan`, `roleUndanganAwal`), so the form
 * names no role of its own.
 */
export function InviteForm({ roles, defaultRole }: { roles: RoleOption[]; defaultRole: RoleOption["value"] | undefined }) {
  const errorPrefix = useId();
  const [state, submit, pending] = useActionState(undangStaf, idleFormState);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UndangStafInput>({
    resolver: zodResolver(undangStafSchema, { error: pesanKesalahan }),
    defaultValues: { email: "", phoneNumber: "", role: defaultRole, reason: "" },
  });
  // An invitation is one person: once it is sent the form is empty again, so the
  // next one is a new entry and not a second copy refused by the domain.
  useResetAfterSubmit(state, () => ({ email: "", phoneNumber: "", role: defaultRole, reason: "" }), reset);

  const describedBy = (field: keyof UndangStafInput) => (errors[field] ? `${errorPrefix}-${field}` : undefined);

  return (
    <form
      noValidate
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={handleSubmit((data) => {
        const formData = new FormData();
        formData.set("email", data.email);
        formData.set("phoneNumber", data.phoneNumber);
        formData.set("role", data.role);
        formData.set("reason", data.reason ?? "");
        startTransition(() => submit(formData));
      })}
    >
      <label className="flex flex-col gap-1 text-sm font-medium">
        Email
        <input
          {...register("email")}
          type="email"
          placeholder="nama@contoh.id"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={describedBy("email")}
          className={inputClass}
        />
        <FieldError id={describedBy("email")} message={errors.email?.message} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Nomor telepon
        <input
          {...register("phoneNumber")}
          type="tel"
          inputMode="tel"
          placeholder="0812 3456 7890"
          aria-invalid={errors.phoneNumber ? true : undefined}
          aria-describedby={describedBy("phoneNumber")}
          className={inputClass}
        />
        <FieldError id={describedBy("phoneNumber")} message={errors.phoneNumber?.message} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Peran
        <select
          {...register("role")}
          aria-invalid={errors.role ? true : undefined}
          aria-describedby={describedBy("role")}
          className={inputClass}
        >
          {roles.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
        <FieldError id={describedBy("role")} message={errors.role?.message} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Catatan (opsional)
        <input
          {...register("reason")}
          maxLength={STAF_REASON_MAX}
          aria-invalid={errors.reason ? true : undefined}
          aria-describedby={describedBy("reason")}
          className={inputClass}
        />
        <FieldError id={describedBy("reason")} message={errors.reason?.message} />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending} className="self-start">
          Kirim undangan
        </Button>
        <ServerResult state={state} />
      </div>
    </form>
  );
}

/** Deactivates one Akun Staf, with a reason. */
export function DeactivateForm({ accountId }: { accountId: string }) {
  const errorPrefix = useId();
  const [state, submit, pending] = useActionState(nonaktifkanStaf, idleFormState);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NonaktifkanStafInput>({
    resolver: zodResolver(nonaktifkanStafSchema, { error: pesanKesalahan }),
    defaultValues: { accountId, reason: "" },
  });
  useResetAfterSubmit(state, () => ({ accountId, reason: "" }), reset);

  const reasonErrorId = errors.reason ? `${errorPrefix}-reason` : undefined;

  return (
    <form
      noValidate
      className="flex flex-wrap items-center gap-2"
      onSubmit={handleSubmit((data) => {
        const formData = new FormData();
        formData.set("accountId", data.accountId);
        formData.set("reason", data.reason);
        startTransition(() => submit(formData));
      })}
    >
      <input type="hidden" {...register("accountId")} />
      <label className="sr-only" htmlFor={`alasan-${accountId}`}>
        Alasan
      </label>
      <input
        id={`alasan-${accountId}`}
        {...register("reason")}
        maxLength={STAF_REASON_MAX}
        placeholder="Alasan"
        aria-invalid={errors.reason ? true : undefined}
        aria-describedby={reasonErrorId}
        className={inputClass}
      />
      <FieldError id={reasonErrorId} message={errors.reason?.message} />
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        Nonaktifkan
      </Button>
      <ServerResult state={state} />
    </form>
  );
}
