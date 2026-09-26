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

export interface RoleOption {
  value: string;
  label: string;
  /** The role's home page. */
  href: string;
}

/**
 * Switches between the staff roles one Akun holds. Hidden when the Akun holds
 * only one role: there is nothing to switch to.
 */
export function RoleSwitcher({
  roles,
  current,
  className,
}: {
  roles: RoleOption[];
  current: string | null;
  className?: string;
}) {
  if (roles.length < 2) return null;
  const active = roles.find((role) => role.value === current);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className={cn("justify-between gap-2 font-normal", className)}
            aria-label={active ? `Peran: ${active.label}. Ganti peran` : "Ganti peran"}
          />
        }
      >
        <span className="text-muted-foreground">Peran</span>
        <span className="font-medium">{active?.label ?? "Pilih"}</span>
        <ChevronsUpDownIcon className="text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Masuk sebagai</DropdownMenuLabel>
          {roles.map((role) => (
            <DropdownMenuLinkItem
              key={role.value}
              render={<Link href={role.href} />}
              aria-current={role.value === current ? "page" : undefined}
            >
              <span className="flex-1">{role.label}</span>
              {role.value === current ? <CheckIcon className="text-primary" aria-label="Peran aktif" /> : null}
            </DropdownMenuLinkItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
