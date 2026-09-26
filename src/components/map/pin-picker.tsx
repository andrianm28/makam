"use client";

import { useState } from "react";
import { PinMap, type Pin } from "./pin-map";

const inputClass =
  "h-10 rounded-lg border border-input bg-background px-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

const rounded = (value: number) => Number(value.toFixed(6));

/**
 * Pin entry for a form: latitude and longitude fields (`pinLat`, `pinLng`)
 * and a draggable pin on the map, kept in step. Clicking the map moves the pin.
 */
export function PinPicker({ initial }: { initial: Pin | null }) {
  const [lat, setLat] = useState(initial ? String(initial.lat) : "");
  const [lng, setLng] = useState(initial ? String(initial.lng) : "");
  const typed = { lat: Number(lat.replace(",", ".")), lng: Number(lng.replace(",", ".")) };
  const pin = lat !== "" && lng !== "" && Number.isFinite(typed.lat) && Number.isFinite(typed.lng) ? typed : null;

  function move(next: Pin) {
    setLat(String(rounded(next.lat)));
    setLng(String(rounded(next.lng)));
  }

  return (
    <div className="flex flex-col gap-2">
      <PinMap pin={pin} onPinChange={move} label="Peta pin Lokasi" />
      <p className="text-xs text-muted-foreground">Klik peta atau geser pin, atau ketik koordinatnya.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Lintang
          <input name="pinLat" inputMode="decimal" value={lat} onChange={(event) => setLat(event.target.value)} placeholder="-6.2" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Bujur
          <input name="pinLng" inputMode="decimal" value={lng} onChange={(event) => setLng(event.target.value)} placeholder="106.8" className={inputClass} />
        </label>
      </div>
    </div>
  );
}
