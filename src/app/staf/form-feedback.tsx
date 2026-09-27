"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import type { FormState } from "./form-state";

/** What a staff form starts with, before anything has been submitted. */
export const idleFormState: FormState = { status: "idle" };

/** The tone a Server Action's result is toasted in, or nothing before a submission. */
export function toastTone(state: FormState): "success" | "error" | null {
  if (state.status === "berhasil") return "success";
  if (state.status === "gagal") return "error";
  return null;
}

/**
 * The Form pattern's one way of reporting a Server Action's result
 * (docs/design-system.md): the same message twice, so the result is there
 * whether or not the Sonner toast is noticed. A save says so as a status, a
 * refusal as an alert, and `StaffToaster` carries the toast to the staff area's
 * light or dark.
 */
export function ServerResult({ state }: { state: FormState }) {
  useEffect(() => {
    if (state.status === "idle") return;
    const tone = toastTone(state);
    if (tone) toast[tone](state.message);
  }, [state]);
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
