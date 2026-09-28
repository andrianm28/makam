import Link from "next/link";
import { cn } from "@/lib/utils";
import type { PublicMenuItem } from "@/lib/public-navigation";

/**
 * The public site's menu, rendered once for the top bar (md and up) and once for
 * the mobile drawer, so the two can never list different things. An item whose
 * page is not built yet is a muted, unlinked row that says "Segera hadir." —
 * never a dead link and never a date (docs/design-system.md, voice and tone).
 */
export function PublicNavList({
  items,
  pathname,
  variant,
}: {
  items: readonly PublicMenuItem[];
  /** The page being read, so it can be marked as the current one. */
  pathname: string;
  variant: "bar" | "drawer";
}) {
  const inDrawer = variant === "drawer";
  return (
    <ul className={cn("flex", inDrawer ? "flex-col gap-1" : "items-center gap-1")}>
      {items.map((item) => {
        const current = item.href !== undefined && pathname === item.href;
        // The drawer has room for the line that says what the page is for, or that
        // it is not there yet; the top bar only carries the short "Segera" on the
        // items that open nothing, so a person knows before tapping.
        const caption = inDrawer ? (
          <span className="text-caption text-muted-foreground">{item.description}</span>
        ) : !item.href ? (
          <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-caption font-medium text-muted-foreground">Segera</span>
        ) : null;
        const body = (
          <>
            {/* The label is always its own element, so the caption beside it can
                never be read as part of the name. */}
            <span className={cn(inDrawer && "min-w-0 flex-1")}>{item.label}</span>
            {caption}
          </>
        );
        return (
          <li key={item.label}>
            {item.href ? (
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex items-center rounded-lg text-body outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                  inDrawer ? "min-h-12 flex-col items-start gap-0 px-4 py-2 text-body-lg" : "h-10 px-3",
                  current
                    ? inDrawer
                      ? "bg-brand-soft font-semibold text-brand-soft-foreground"
                      : "font-semibold text-forest"
                    : "font-medium text-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {body}
              </Link>
            ) : (
              <span
                className={cn(
                  "flex items-center text-body font-medium text-muted-foreground",
                  inDrawer ? "min-h-12 flex-col items-start gap-0 px-4 py-2 text-body-lg" : "h-10 px-3",
                )}
              >
                {body}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
