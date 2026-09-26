"use client";

/*
 * PROTOTYPE, throwaway. A centered dialog built directly on @base-ui/react,
 * styled like the shipped Sheet (src/components/ui/sheet.tsx) so it reads as
 * part of the same system without adding a new primitive to src/components/ui.
 */
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

export function DialogContent({
  className,
  children,
  title,
  description,
  width = "sm:max-w-md",
}: {
  className?: string;
  children: React.ReactNode;
  title: string;
  description?: string;
  width?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-overlay transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
      <DialogPrimitive.Popup
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[calc(100%-1.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-2xl border border-border bg-popover p-5 shadow-lg transition duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
          width,
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <DialogPrimitive.Title className="text-title-3 text-foreground">{title}</DialogPrimitive.Title>
            {description ? <DialogPrimitive.Description className="mt-0.5 text-small text-muted-foreground">{description}</DialogPrimitive.Description> : null}
          </div>
          <DialogPrimitive.Close
            aria-label="Tutup"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
          >
            <XIcon className="size-4" aria-hidden />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const fieldInputClass =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-body text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function Field({ label, hint, error, children, id }: { label: string; hint?: string; error?: string; children: React.ReactNode; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-body font-medium text-foreground">
        {label}
      </label>
      {children}
      {error ? <p className="text-small text-danger">{error}</p> : hint ? <p className="text-small text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
