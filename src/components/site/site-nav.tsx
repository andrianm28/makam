"use client";

import { usePathname } from "next/navigation";
import { PublicNavList } from "@/components/site/public-nav-list";
import type { PublicMenuItem } from "@/lib/public-navigation";

/**
 * The menu, marked with the page being read. The list itself is a plain
 * component (so it can be checked on its own); this wrapper only reads the
 * pathname the router already knows.
 */
export function SiteNav({ items, variant }: { items: readonly PublicMenuItem[]; variant: "bar" | "drawer" }) {
  const pathname = usePathname() ?? "/";
  // Keyed by the page, so an open dropdown closes once its link has been followed.
  return <PublicNavList key={pathname} items={items} pathname={pathname} variant={variant} />;
}
