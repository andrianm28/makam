"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/**
 * Asks before a write that is hard to undo (Tangguhkan, Nonaktifkan, Hapus).
 * The confirm button repeats the action's verb; a destructive action uses the
 * danger fill. With `reasonLabel`, a reason is required and goes to the Audit
 * Log with the write.
 */
export function ConfirmDialog({
  trigger,
  triggerLabel,
  title,
  description,
  confirmLabel,
  destructive,
  reasonLabel,
  onConfirm,
}: {
  /** The element that opens the dialog, e.g. <Button variant="outline" />. */
  trigger: React.ReactElement;
  /** The trigger's text, usually the same verb as `confirmLabel`. */
  triggerLabel: React.ReactNode;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  reasonLabel?: string;
  onConfirm: (reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const reasonId = useId();
  const missing = reasonLabel !== undefined && reason.trim() === "";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setReason("");
          setTouched(false);
        }
      }}
    >
      <DialogTrigger render={trigger}>{triggerLabel}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-title-3">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {reasonLabel ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={reasonId} className="text-small font-medium">
              {reasonLabel}
            </label>
            <Textarea
              id={reasonId}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={touched && missing}
              aria-describedby={`${reasonId}-hint`}
            />
            <p id={`${reasonId}-hint`} className={touched && missing ? "text-small text-danger-soft-foreground" : "text-small text-muted-foreground"}>
              {touched && missing ? "Isi alasan dulu. Alasan dicatat di Audit Log." : "Dicatat di Audit Log bersama perubahan ini."}
            </p>
          </div>
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Batal</DialogClose>
          <Button
            className={destructive ? "bg-danger text-danger-foreground hover:bg-danger/90" : undefined}
            onClick={() => {
              if (missing) {
                setTouched(true);
                return;
              }
              onConfirm(reason.trim());
              setOpen(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
