"use client";

import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface LokasiOption {
  value: string;
  label: string;
  /** Where this option leads: the same kind of page, scoped to this Lokasi Mitra. */
  href: string;
}

/**
 * Switches which of the signed-in Admin Lokasi's own Lokasi Mitra the current
 * page is scoped to. Hidden when it works on only one: there is nothing to
 * switch to.
 */
export function LokasiSwitcher({
  lokasi,
  current,
  className,
}: {
  lokasi: LokasiOption[];
  current: string | null;
  className?: string;
}) {
  if (lokasi.length < 2) return null;
  const active = lokasi.find((item) => item.value === current);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className={cn("justify-between gap-2 font-normal", className)}
            aria-label={active ? `Lokasi: ${active.label}. Ganti Lokasi` : "Ganti Lokasi"}
          />
        }
      >
        <span className="text-muted-foreground">Lokasi</span>
        <span className="max-w-40 truncate font-medium">{active?.label ?? "Pilih"}</span>
        <ChevronsUpDownIcon className="text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Ganti Lokasi</DropdownMenuLabel>
          {lokasi.map((item) => (
            <DropdownMenuLinkItem
              key={item.value}
              render={<Link href={item.href} />}
              aria-current={item.value === current ? "page" : undefined}
            >
              <span className="flex-1 truncate">{item.label}</span>
              {item.value === current ? <CheckIcon className="text-primary" aria-label="Lokasi aktif" /> : null}
            </DropdownMenuLinkItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
