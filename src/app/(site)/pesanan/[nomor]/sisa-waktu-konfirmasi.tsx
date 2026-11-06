"use client";

import { useEffect, useState } from "react";
import { sisaWaktuLabel } from "./sisa-waktu";

/**
 * The SLA timer on an order waiting for its Lokasi Mitra (rapat Ira, 6 Nov 2026): how long is left until the
 * deadline the page already states. The server renders the first value from its Clock, so the markup matches on
 * hydration; the browser only counts it down. The deadline itself, and what happens when it passes, stay the
 * Pemesanan module's.
 */
export function SisaWaktuKonfirmasi({ dueAtIso, nowIso }: { dueAtIso: string; nowIso: string }) {
  const dueAt = new Date(dueAtIso).getTime();
  const [sisaMs, setSisaMs] = useState(() => dueAt - new Date(nowIso).getTime());
  useEffect(() => {
    const offset = new Date(nowIso).getTime() - Date.now();
    const tick = () => setSisaMs(dueAt - (Date.now() + offset));
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [dueAt, nowIso]);
  return (
    <span className="font-semibold tabular-nums" data-testid="sisa-waktu-konfirmasi" aria-live="off">
      {sisaWaktuLabel(sisaMs)}
    </span>
  );
}
