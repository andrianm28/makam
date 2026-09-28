"use client";

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The wizard's form primitives, in one file: a titled group of fields, one field
 * with its label and what is wrong with it right under the input, and a
 * two-option choice. Both wizard screens (a Lokasi Mitra and a TPU) use these, so
 * a field looks and behaves the same in both.
 */

export function Fieldset({ legend, note, children }: { legend: string; note?: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <legend className="sr-only">{legend}</legend>
      <div>
        <p className="text-title-3 text-foreground">{legend}</p>
        {note ? <p className="mt-0.5 text-small text-muted-foreground">{note}</p> : null}
      </div>
      {children}
    </fieldset>
  );
}

/**
 * One field: its label, the input, and what is wrong with it right under the
 * input, where the person who has to fix it is looking (docs/design-system.md:
 * "errors inline under the field").
 */
export function Field({
  id,
  label,
  hint,
  optional,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  optional?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-body font-medium text-foreground">
        {label}
        {optional ? <span className="font-normal text-muted-foreground"> (opsional)</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-galat`} role="alert" className="text-small text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-small text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** One choice between two or three options, as a tap or a keyboard can make it. */
export function Pilihan({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={label}>
      {options.map(([value_, text]) => (
        <button
          key={value_}
          type="button"
          role="radio"
          aria-checked={value === value_}
          onClick={() => onChange(value_)}
          className={cn(
            "flex h-12 items-center gap-3 rounded-lg border px-4 text-left text-body-lg",
            value === value_ ? "border-primary bg-brand-soft font-medium text-brand-soft-foreground" : "border-input bg-card",
          )}
        >
          <span
            className={cn(
              "inline-flex size-4 items-center justify-center rounded-full border-2",
              value === value_ ? "border-primary bg-primary text-primary-foreground" : "border-border-strong",
            )}
            aria-hidden
          >
            {value === value_ ? <Check className="size-3" /> : null}
          </span>
          {text}
        </button>
      ))}
    </div>
  );
}
