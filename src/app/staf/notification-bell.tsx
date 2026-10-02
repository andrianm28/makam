"use client";

import { BellIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { bacaPeringatanStaf } from "@/app/staf/alert-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { StaffAlertEntry } from "@/domain/notifications";
import { cn } from "@/lib/utils";

/**
 * The header bell: the signed-in Akun Staf's Peringatan Staf, newest first,
 * each linking to its subject. Opening it marks every one of them read.
 */
export function NotificationBell({ unread, latest }: { unread: number; latest: StaffAlertEntry[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && unread > 0) {
      startTransition(async () => {
        await bacaPeringatanStaf();
        router.refresh();
      });
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={unread > 0 ? `Peringatan Staf, ${unread} belum dibaca` : "Peringatan Staf"}
          />
        }
      >
        <BellIcon aria-hidden />
        {unread > 0 ? (
          <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-medium text-primary-foreground tabular-nums">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Peringatan Staf</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {latest.length === 0 ? (
            <p className="px-1.5 py-4 text-center text-small text-muted-foreground">Belum ada Peringatan Staf.</p>
          ) : (
            latest.map((alert) => (
              <DropdownMenuLinkItem
                key={alert.id}
                render={<Link href={alert.url} />}
                className="flex-col items-start gap-0.5 py-1.5 whitespace-normal"
              >
                <span className={cn("text-small", !alert.read && "font-semibold")}>{alert.title}</span>
                <span className="text-caption text-muted-foreground">{alert.body}</span>
              </DropdownMenuLinkItem>
            ))
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
