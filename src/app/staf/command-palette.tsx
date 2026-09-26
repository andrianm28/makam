"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import type { PaletteGroup } from "@/lib/staff-navigation";
import { cn } from "@/lib/utils";

/** One page the palette can open, flattened out of its role's groups. */
interface PaletteEntry {
  group: string;
  label: string;
  href: string;
}

/**
 * The ⌘K / Ctrl+K command palette: every page of the current role's menu (and
 * the pages it links, e.g. each Lokasi Mitra), filtered as the person types.
 * Role visibility is decided server-side (`staffPalette`, `src/server/staff-area.ts`);
 * this component only renders what it is handed.
 */
export function CommandPalette({ groups }: { groups: PaletteGroup[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();

  const entries = useMemo<PaletteEntry[]>(
    () => groups.flatMap((group) => group.items.map((item) => ({ group: group.label, label: item.label, href: item.href }))),
    [groups],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("id");
    if (!needle) return entries;
    return entries.filter((entry) => `${entry.group} ${entry.label}`.toLocaleLowerCase("id").includes(needle));
  }, [entries, query]);

  // Read from an event handler, never during render: the latest `open`, for the
  // global shortcut below (which toggles it from outside React's own handlers).
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  /** Opens or closes the palette, always starting the next open with a clean search. */
  function setPaletteOpen(next: boolean) {
    setOpen(next);
    setQuery("");
    setActiveIndex(0);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(!openRef.current);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function go(entry: PaletteEntry) {
    setPaletteOpen(false);
    router.push(entry.href);
  }

  function onQueryChange(value: string) {
    setQuery(value);
    setActiveIndex(0);
  }

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const entry = filtered[activeIndex];
      if (entry) go(entry);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setPaletteOpen}>
      <DialogPrimitive.Trigger
        render={<Button variant="ghost" size="icon" aria-label="Buka menu cepat (Ctrl+K atau ⌘K)" />}
      >
        <SearchIcon aria-hidden />
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-overlay transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <DialogPrimitive.Popup
          className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 transition duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0"
        >
          <DialogPrimitive.Title className="sr-only">Menu cepat</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Cari dan buka halaman menu peran ini.
          </DialogPrimitive.Description>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={onInputKeyDown}
              placeholder="Cari halaman…"
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-activedescendant={filtered[activeIndex] ? `${listId}-${activeIndex}` : undefined}
              className="h-11 w-full bg-transparent text-small outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul id={listId} role="listbox" aria-label="Halaman" className="max-h-80 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <li className="px-2.5 py-6 text-center text-small text-muted-foreground">Tidak ada halaman yang cocok.</li>
            ) : (
              filtered.map((entry, index) => (
                <li
                  key={entry.href}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => go(entry)}
                  className={cn(
                    "flex cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-small",
                    index === activeIndex ? "bg-accent text-accent-foreground" : "text-foreground",
                  )}
                >
                  <span className="text-muted-foreground">{entry.group}</span>
                  <span aria-hidden className="text-muted-foreground">
                    ·
                  </span>
                  <span className="truncate font-medium">{entry.label}</span>
                </li>
              ))
            )}
          </ul>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
