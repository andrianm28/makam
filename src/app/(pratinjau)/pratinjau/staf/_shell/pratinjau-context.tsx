"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Density } from "@/components/makam/data-table";

/**
 * PROTOTYPE: the knobs the floating bar turns. Kept in the browser only
 * (localStorage), applied as data attributes on <html> so pratinjau.css can
 * swap tokens.
 */
export const accents = [
  { key: "kamboja", label: "Kamboja (sage-teal)" },
  { key: "zaitun", label: "Zaitun (olive)" },
  { key: "tinta", label: "Tinta (neutral primary)" },
] as const;
export type Accent = (typeof accents)[number]["key"];

interface PratinjauState {
  accent: Accent;
  setAccent: (accent: Accent) => void;
  density: Density;
  setDensity: (density: Density) => void;
}

const Ctx = createContext<PratinjauState | null>(null);

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the choice lasts until reload.
  }
}

export function PratinjauProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<Accent>("kamboja");
  const [density, setDensityState] = useState<Density>("comfortable");

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("aksen");
    const keys = accents.map((item) => item.key);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser-only storage after hydration
    setAccentState(fromUrl && (keys as string[]).includes(fromUrl) ? (fromUrl as Accent) : read("pratinjau-aksen", keys, "kamboja"));
    setDensityState(read("pratinjau-kepadatan", ["comfortable", "compact"] as const, "comfortable"));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.aksen = accent;
    return () => {
      delete document.documentElement.dataset.aksen;
    };
  }, [accent]);

  return (
    <Ctx.Provider
      value={{
        accent,
        setAccent: (next) => {
          setAccentState(next);
          write("pratinjau-aksen", next);
        },
        density,
        setDensity: (next) => {
          setDensityState(next);
          write("pratinjau-kepadatan", next);
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function usePratinjau() {
  const value = useContext(Ctx);
  if (!value) throw new Error("usePratinjau must be used inside PratinjauProvider");
  return value;
}
