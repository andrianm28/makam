import type { Viewport } from "next";

/**
 * The browser bar takes the page colour: Ivory, or the dark Forest ground in
 * dark mode. `viewportFit: "cover"` draws under the iPhone's home indicator so
 * `env(safe-area-inset-bottom)` reports its real height for the field roles'
 * bottom navigation (`BottomNav`, `staff-shell.tsx`).
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F4ED" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1711" },
  ],
  viewportFit: "cover",
};
