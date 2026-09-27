"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { bacaPeringatanStaf } from "./alert-actions";

/**
 * Marks every Peringatan Staf of the signed-in Akun Staf read once this page
 * is shown, the same effect as opening the header bell (`NotificationBell`).
 * Renders nothing.
 */
export function MarkPeringatanRead({ unread }: { unread: number }) {
  const router = useRouter();

  useEffect(() => {
    if (unread === 0) return;
    void bacaPeringatanStaf().then(() => router.refresh());
  }, [unread, router]);

  return null;
}
