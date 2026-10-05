"use client";

import { useId, useReducer } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { confirmDialogClosed, confirmDialogReducer } from "./confirm-dialog-state";

/**
 * An action that can't be undone, or needs a reason for the Audit Log
 * (docs/design-system.md, "Usage rules"): never a toast with undo. The
 * confirm button submits `formId`'s form (its content is portalled, so the
 * reason textarea and the confirm button both carry a `form` attribute
 * pointing at it, rather than nesting inside it). Every opening starts with
 * an empty reason (`confirm-dialog-state.ts`); a caller that shows one dialog
 * or another at the same place gives each a `key`, so React never reuses one
 * dialog's open state for the other's action.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel = "Batal",
  variant = "default",
  pending = false,
  formId,
  reason,
  children,
}: {
  trigger: React.ReactElement;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  pending?: boolean;
  /** The id of the `<form>` the confirm button (and the reason field) submit. */
  formId: string;
  /** A reason the Audit Log requires before this is confirmed. */
  reason?: { name: string; label: string; placeholder?: string };
  children?: React.ReactNode;
}) {
  const [dialog, dispatch] = useReducer(confirmDialogReducer, confirmDialogClosed);
  const reasonId = useId();
  const reasonMissing = reason !== undefined && dialog.reason.trim() === "";

  return (
    <AlertDialog open={dialog.open} onOpenChange={(open) => dispatch({ type: "open_changed", open })}>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {children}
        {reason ? (
          <label htmlFor={reasonId} className="flex flex-col gap-1 text-left text-small font-medium text-foreground">
            {reason.label}
            <textarea
              id={reasonId}
              name={reason.name}
              form={formId}
              required
              rows={3}
              maxLength={500}
              value={dialog.reason}
              onChange={(event) => dispatch({ type: "reason_typed", reason: event.target.value })}
              placeholder={reason.placeholder}
              className="rounded-lg border border-input bg-background px-3 py-2 text-body outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </label>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            type="submit"
            form={formId}
            variant={variant}
            disabled={pending || reasonMissing}
            onClick={() => dispatch({ type: "open_changed", open: false })}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
