"use client";

import { useTheme } from "next-themes";
import { Toaster } from "sonner";

/**
 * The staff area's toast host for Form-pattern results (docs/design-system.md):
 * one Sonner toast per save, following the staff light/dark choice. Pages call
 * `toast.success` / `toast.error` with the Server Action's message and keep the
 * same message inline, so the result is also there without sound or motion.
 */
export function StaffToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster theme={resolvedTheme === "dark" ? "dark" : "light"} />;
}
