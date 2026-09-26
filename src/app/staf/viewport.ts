import type { Viewport } from "next";

/** The browser bar takes the page colour: Ivory, or the dark Forest ground in dark mode. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F4ED" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1711" },
  ],
};
