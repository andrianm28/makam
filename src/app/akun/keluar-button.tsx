"use client";

import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { STAFF_AREA_PATH } from "@/lib/staff-area-path";
import { keluar } from "./actions";

/**
 * This browser's staff push, turned off in the browser too. Keluar ends the
 * session, and with it the Perangkat Push on the server; dropping the browser's
 * subscription as well means the next Akun signed in here starts with push off.
 */
async function unsubscribeStaffPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration(STAFF_AREA_PATH);
    await (await registration?.pushManager.getSubscription())?.unsubscribe();
  } catch (error) {
    // Keluar goes ahead: the server has already stopped counting this browser once the session ends.
    Sentry.captureException(error, { tags: { step: "keluar_unsubscribe_push" } });
  }
}

/** Keluar: turns this browser's staff push off, then ends the session. */
export function KeluarButton({ size }: { size?: "sm" }) {
  return (
    <form
      action={async () => {
        await unsubscribeStaffPush();
        await keluar();
      }}
    >
      <Button type="submit" variant="outline" size={size}>
        Keluar
      </Button>
    </form>
  );
}
