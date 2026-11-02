import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PublicMenuItem } from "@/lib/public-navigation";

/**
 * The public site's menu, rendered once for the top bar (lg and up) and once for
 * the mobile drawer, so the two can never list different things. An item whose
 * page is not built yet is a muted, unlinked row that says "Segera hadir." —
 * never a dead link and never a date (docs/design-system.md, voice and tone).
 *
 * A group (Jasa Pemakaman, Layanan Kedukaan) opens a dropdown in the top bar — a
 * native disclosure, so it works before any script runs — and lists its pages
 * under its own name in the drawer.
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
      {items.map((item) => (
        <li key={item.label} className={cn(!inDrawer && item.children && "relative")}>
          {item.children && !inDrawer ? (
            <details className="group">
              <summary
                className={cn(
                  "flex h-10 cursor-pointer list-none items-center gap-1 rounded-lg px-3 text-body font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ivory/60 [&::-webkit-details-marker]:hidden",
                  item.children.some((child) => child.href === pathname) || item.href === pathname
                    ? "font-semibold text-ivory underline underline-offset-8"
                    : "text-ivory/90 hover:bg-ivory/10 hover:text-ivory",
                )}
              >
                <span>{item.label}</span>
                <ChevronDownIcon aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
              </summary>
              <ul className="absolute left-0 top-full z-50 mt-2 flex w-72 flex-col gap-0.5 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg">
                {item.children.map((child) => (
                  <li key={child.label}>
                    <MenuLink item={child} pathname={pathname} variant="dropdown" />
                  </li>
                ))}
                {item.href && !item.children.some((child) => child.href === item.href) ? (
                  <li className="mt-1 border-t border-border pt-1">
                    <MenuLink item={{ label: `Semua ${item.label}`, href: item.href, description: item.description }} pathname={pathname} variant="dropdown" />
                  </li>
                ) : null}
              </ul>
            </details>
          ) : (
            <MenuLink item={item} pathname={pathname} variant={variant} />
          )}
          {item.children && inDrawer ? (
            <ul className="mb-1 ml-4 flex flex-col border-l border-border pl-2">
              {item.children.map((child) => (
                <li key={child.label}>
                  <MenuLink item={child} pathname={pathname} variant="drawer-child" />
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function MenuLink({ item, pathname, variant }: { item: PublicMenuItem; pathname: string; variant: "bar" | "drawer" | "drawer-child" | "dropdown" }) {
  const current = item.href !== undefined && pathname === item.href;
  const inDrawer = variant === "drawer";
  const onLight = variant !== "bar";
  // The drawer has room for the line that says what the page is for, or that
  // it is not there yet; the top bar only carries the short "Segera" on the
  // items that open nothing, so a person knows before tapping.
  const caption = inDrawer ? (
    <span className="text-caption text-muted-foreground">{item.description}</span>
  ) : !item.href ? (
    <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-caption font-medium", onLight ? "bg-muted text-muted-foreground" : "bg-ivory/15 text-ivory")}>Segera</span>
  ) : null;
  const body = (
    <>
      {/* The label is always its own element, so the caption beside it can
          never be read as part of the name. */}
      <span className={cn(inDrawer && "min-w-0 flex-1")}>{item.label}</span>
      {caption}
    </>
  );
  const shape =
    variant === "bar"
      ? "h-10 px-3"
      : variant === "drawer"
        ? "min-h-12 flex-col items-start gap-0 px-4 py-2 text-body-lg"
        : "min-h-11 px-3 py-2";
  if (!item.href) {
    return <span className={cn("flex items-center text-body font-medium", onLight ? "text-muted-foreground" : "text-ivory/70", shape)}>{body}</span>;
  }
  return (
    <Link
      href={item.href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex items-center rounded-lg text-body outline-none transition-colors focus-visible:ring-3",
        onLight ? "focus-visible:ring-ring/50" : "focus-visible:ring-ivory/60",
        shape,
        current
          ? onLight
            ? "bg-brand-soft font-semibold text-brand-soft-foreground"
            : "font-semibold text-ivory underline underline-offset-8"
          : onLight
            ? "font-medium text-foreground hover:bg-accent hover:text-accent-foreground"
            : "font-medium text-ivory/90 hover:bg-ivory/10 hover:text-ivory",
      )}
    >
      {body}
    </Link>
  );
}
