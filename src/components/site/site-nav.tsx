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
  return <PublicNavList items={items} pathname={usePathname() ?? "/"} variant={variant} />;
}
