/**
 * Keyless Google Maps on public pages (spec, "Maps on public pages",
 * following the frozen makam-app): no API key, no billing. A pin's
 * coordinates are the query when there is one; without a pin, the address
 * text is the query; with neither, there is nothing to show (a pin is never
 * invented).
 */

export interface MapSubject {
  pin: { lat: number; lng: number } | null;
  address: string;
}

/** The query `embedMapUrl` / `directionsUrl` use, or null when there is nothing to map. */
export function mapsQueryFor(subject: MapSubject): string | null {
  if (subject.pin) return `${subject.pin.lat},${subject.pin.lng}`;
  const address = subject.address.trim();
  return address === "" ? null : address;
}

/** A lazily loaded iframe embed, keyless (`output=embed`). */
export function embedMapUrl(query: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

/** "Petunjuk arah": opens the Google Maps app on phones, the web app elsewhere. */
export function directionsUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
