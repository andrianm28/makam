"use client";

import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  current: string;
  className?: string;
}) {
  const router = useRouter();
  if (roles.length < 2) return null;
  const active = roles.find((role) => role.value === current) ?? roles[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" className={cn("justify-between gap-2 font-normal", className)} aria-label={`Peran: ${active.label}. Ganti peran`} />
        }
      >
        <span className="text-muted-foreground">Peran</span>
        <span className="font-medium">{active.label}</span>
        <ChevronsUpDownIcon className="text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Masuk sebagai</DropdownMenuLabel>
          {roles.map((role) => (
            <DropdownMenuItem key={role.value} onClick={() => router.push(role.href)}>
              <span className="flex-1">{role.label}</span>
              {role.value === active.value ? <CheckIcon className="text-primary" aria-label="Peran aktif" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
