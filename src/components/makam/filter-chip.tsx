import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterChipProps {
  href: string;
  selected?: boolean;
  children: React.ReactNode;
}

/**
 * One filter chip on the public site: a plain link, so a filter stays a
 * shareable URL and works with no client JS (Daftar Lokasi's city, jenis and
 * fasilitas chips; the booking wizards have their own copies today — ticket
 * follow-up to move them here too).
 *
 * Always at least `--touch-target` (44px) tall, on every pointer: the public
 * site never keeps the staff area's "dense on desktop, raised only on
 * `pointer: coarse`" pattern (docs/design-system.md, `data-slot="button"` and
 * friends in `globals.css`), so a chip does not shrink under 44px on a mouse
 * either. `h-10` still sets the resting height the design was drawn at;
 * `min-h-(--touch-target)` only raises it when that resting height is under
 * the floor.
 */
export function FilterChip({ href, selected, children }: FilterChipProps) {
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "inline-flex h-10 min-h-(--touch-target) items-center gap-1.5 rounded-full border px-4 text-body font-medium whitespace-nowrap transition-colors",
        selected ? "border-forest bg-forest text-primary-foreground" : "border-border-strong bg-card text-foreground hover:bg-accent",
      )}
    >
      {selected ? <CheckIcon className="size-4" aria-hidden /> : null}
      {children}
    </Link>
  );
}
