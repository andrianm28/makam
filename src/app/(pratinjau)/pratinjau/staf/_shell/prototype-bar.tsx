"use client";

import { ChevronLeftIcon, ChevronRightIcon, FlaskConicalIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { accents, usePratinjau } from "./pratinjau-context";

/**
 * PROTOTYPE floating bar, deliberately not part of the design being judged:
 * cycles the accent variants (← →, or ?aksen=kamboja|zaitun|tinta) and
 * switches table density. Collapses to a small button.
 */
export function PrototypeBar() {
  const { accent, setAccent, density, setDensity } = usePratinjau();
  const [shown, setShown] = useState(true);
  const index = accents.findIndex((item) => item.key === accent);
  const cycle = (step: number) => setAccent(accents[(index + step + accents.length) % accents.length].key);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only preference
      if (window.localStorage.getItem("pratinjau-bar") === "0") setShown(false);
    } catch {}
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable], [role=dialog], [role=menu], [role=listbox], [role=tablist]")) return;
      if (event.key === "ArrowLeft") cycle(-1);
      if (event.key === "ArrowRight") cycle(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const remember = (value: boolean) => {
    setShown(value);
    try {
      window.localStorage.setItem("pratinjau-bar", value ? "1" : "0");
    } catch {}
  };

  if (!shown) {
    return (
      <button
        type="button"
        onClick={() => remember(true)}
        className="fixed right-3 bottom-[calc(var(--bottom-nav-height)+0.75rem)] z-50 flex size-9 items-center justify-center rounded-full bg-zinc-900 text-white shadow-lg md:bottom-3"
        aria-label="Tampilkan panel pratinjau"
      >
        <FlaskConicalIcon className="size-4" />
      </button>
    );
  }

  return (
    <div
      role="region"
      aria-label="Panel pratinjau"
      className="fixed bottom-[calc(var(--bottom-nav-height)+0.75rem)] left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-zinc-900 px-1.5 py-1.5 text-xs text-white shadow-[0_8px_30px_rgb(0_0_0/0.35)] ring-1 ring-white/10 md:bottom-4"
    >
      <span className="flex items-center gap-1 pr-1 pl-2 text-zinc-400">
        <FlaskConicalIcon className="size-3.5" aria-hidden /> Pratinjau
      </span>
      <button type="button" onClick={() => cycle(-1)} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Aksen sebelumnya">
        <ChevronLeftIcon className="size-4" />
      </button>
      <span className="min-w-40 text-center font-medium" aria-live="polite">
        {String.fromCharCode(65 + index)}: {accents[index].label}
      </span>
      <button type="button" onClick={() => cycle(1)} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Aksen berikutnya">
        <ChevronRightIcon className="size-4" />
      </button>
      <span className="mx-1 h-4 w-px bg-white/15" aria-hidden />
      <button
        type="button"
        onClick={() => setDensity(density === "comfortable" ? "compact" : "comfortable")}
        className="rounded-full px-2.5 py-1.5 hover:bg-white/10"
      >
        {density === "comfortable" ? "Nyaman" : "Rapat"}
      </button>
      <button type="button" onClick={() => remember(false)} className="rounded-full p-1.5 text-zinc-400 hover:bg-white/10" aria-label="Sembunyikan panel pratinjau">
        <XIcon className="size-4" />
      </button>
    </div>
  );
}
