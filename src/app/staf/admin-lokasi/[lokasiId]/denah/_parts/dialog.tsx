"use client";

/**
 * A centered dialog built directly on @base-ui/react, styled like the shipped
 * Sheet (src/components/ui/sheet.tsx) so it reads as part of the same system
 * without adding a new primitive to src/components/ui (ticket 13's prototype,
 * `pratinjau/denah/_parts/dialog.tsx`, decided this shape; ported 1:1). Its
 * fields are the real shadcn Button/Input/Select (docs/design-system.md,
 * "Components"), never a hand-rolled `<input>`/`<select>`/`<button>`, so they
 * keep the 44px touch-target rule (globals.css, `@media (pointer: coarse)`)
 * and every other shadcn behaviour for free.
 */
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { FieldError } from "@/components/makam/form-section";
import { Button } from "@/components/ui/button";
import { popupOverlayClassName } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

/** How wide `DialogContent` opens: `sm` (the default, most forms here) or `md` (Bersihkan's longer form). */
export type DialogWidth = "sm" | "md";

const dialogWidthClass: Record<DialogWidth, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
};

export function DialogContent({
  className,
  children,
  title,
  description,
  width = "sm",
}: {
  className?: string;
  children: React.ReactNode;
  title: string;
  description?: string;
  width?: DialogWidth;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className={popupOverlayClassName} />
      <DialogPrimitive.Popup
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[calc(100%-1.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-2xl border border-border bg-popover p-5 shadow-lg transition duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
          dialogWidthClass[width],
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <DialogPrimitive.Title className="text-title-3 text-foreground">{title}</DialogPrimitive.Title>
            {description ? <DialogPrimitive.Description className="mt-0.5 text-small text-muted-foreground">{description}</DialogPrimitive.Description> : null}
          </div>
          <DialogPrimitive.Close render={<Button variant="ghost" size="icon-sm" className="shrink-0" />}>
            <XIcon aria-hidden />
            <span className="sr-only">Tutup</span>
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function Field({ label, hint, error, children, id }: { label: string; hint?: string; error?: string; children: React.ReactNode; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-body font-medium text-foreground">
        {label}
      </label>
      {children}
      {error ? <FieldError message={error} /> : hint ? <p className="text-small text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
