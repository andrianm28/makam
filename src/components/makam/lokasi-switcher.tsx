"use client";

import { ChevronsUpDownIcon, MapPinIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface LokasiOption {
  id: string;
  name: string;
  kota: string;
}

/**
 * Picks which Lokasi Mitra an Admin Lokasi is working on. Every Admin Lokasi
 * screen is scoped to the one chosen here. Searchable, because an Admin Lokasi
 * may hold several.
 */
export function LokasiSwitcher({
  lokasi,
  currentId,
  onSelect,
  className,
}: {
  lokasi: LokasiOption[];
  currentId: string;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = lokasi.find((item) => item.id === currentId) ?? lokasi[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={cn("max-w-64 justify-between gap-2 font-normal", className)}
            aria-label={`Lokasi Mitra: ${current.name}. Ganti Lokasi Mitra`}
          />
        }
      >
        <MapPinIcon className="text-muted-foreground" aria-hidden />
        <span className="truncate font-medium">{current.name}</span>
        <ChevronsUpDownIcon className="text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Cari Lokasi Mitra" />
          <CommandList>
            <CommandEmpty>Tidak ada Lokasi Mitra dengan nama itu.</CommandEmpty>
            <CommandGroup heading="Lokasi Mitra Anda">
              {lokasi.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.name} ${item.kota}`}
                  data-checked={item.id === current.id}
                  onSelect={() => {
                    onSelect(item.id);
                    setOpen(false);
                  }}
                >
                  <span className="flex flex-col">
                    <span>{item.name}</span>
                    <span className="text-caption text-muted-foreground">{item.kota}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
