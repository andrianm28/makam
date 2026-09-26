"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { usePathname } from "next/navigation";
import { forcedThemeFor } from "@/lib/theme-scope";

/**
 * Light and dark (next-themes, a class on <html>). Dark mode is for the staff
 * area only: every other page is held to light, whatever the person chose there.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      forcedTheme={forcedThemeFor(pathname)}
    >
      {children}
    </NextThemesProvider>
  );
}
