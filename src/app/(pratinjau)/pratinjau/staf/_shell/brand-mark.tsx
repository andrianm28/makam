import { cn } from "@/lib/utils";

/** PROTOTYPE logo mark: five kamboja (frangipani) petals around a point. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-md bg-brand text-brand-foreground", className)}>
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
        {[0, 72, 144, 216, 288].map((angle) => (
          <ellipse key={angle} cx="12" cy="7" rx="3.1" ry="5" transform={`rotate(${angle} 12 12)`} fill="currentColor" opacity="0.92" />
        ))}
        <circle cx="12" cy="12" r="1.6" className="fill-brand" />
      </svg>
    </span>
  );
}
