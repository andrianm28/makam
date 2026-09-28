import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterChipProps {
  href: string;
  selected?: boolean;
  children: React.ReactNode;
  /** Passed straight to next/link's `scroll`; omit for its default (scroll to top). */
  scroll?: boolean;
}

/**
 * One filter chip on the public site: a plain link, so a filter stays a
 * shareable URL and works with no client JS (Daftar Lokasi's city, jenis and
 * fasilitas chips; the Saat Duka and Pemesanan Terencana wizards' own link
 * filters too). Saat Duka's `ingatKota` city filter stays its own
 * Button-in-form — it submits a Server Action (the visitor's city-preference
 * cookie), not a link, so it cannot be this component.
 *
 * Always at least `--touch-target` (44px) tall, on every pointer: the public
 * site never keeps the staff area's "dense on desktop, raised only on
 * `pointer: coarse`" pattern (docs/design-system.md, `data-slot="button"` and
 * friends in `globals.css`), so a chip does not shrink under 44px on a mouse
 * either. `h-10` still sets the resting height the design was drawn at;
 * `min-h-(--touch-target)` only raises it when that resting height is under
 * the floor.
 */
export function FilterChip({ href, selected, children, scroll }: FilterChipProps) {
  return (
    <Link
      href={href}
      scroll={scroll}
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
