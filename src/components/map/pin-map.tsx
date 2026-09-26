"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import { DEFAULT_MAP_CENTER, mapTiles, type TileProvider } from "./tiles";

export interface Pin {
  lat: number;
  lng: number;
}

/** The live Leaflet objects behind one PinMap. */
interface MapHandle {
  L: typeof import("leaflet");
  map: LeafletMap;
  marker: Marker | null;
  editable: boolean;
  onChange: { current: ((pin: Pin) => void) | undefined };
}

// A plain CSS dot in the brand colours: Leaflet's default marker images do not survive bundling.
const PIN_HTML =
  '<span style="display:block;width:18px;height:18px;border-radius:9999px;background:var(--primary);border:3px solid var(--card);box-shadow:var(--shadow-md)"></span>';

/** Moves (or places, or removes) the handle's marker to `pin`. */
function placeMarker(handle: MapHandle, pin: Pin | null) {
  if (!pin) {
    handle.marker?.remove();
    handle.marker = null;
    return;
  }
  if (handle.marker) {
    handle.marker.setLatLng(pin);
  } else {
    const icon = handle.L.divIcon({ className: "", html: PIN_HTML, iconSize: [18, 18], iconAnchor: [9, 9] });
    const marker = handle.L.marker(pin, { icon, draggable: handle.editable, keyboard: handle.editable }).addTo(handle.map);
    marker.on("dragend", () => {
      const at = marker.getLatLng();
      handle.onChange.current?.({ lat: at.lat, lng: at.lng });
    });
    handle.marker = marker;
  }
  handle.map.panTo(pin);
}

/**
 * A Leaflet map showing one pin. With `onPinChange` it is an entry: the pin
 * can be dragged, or placed by clicking the map. Leaflet needs the browser, so
 * it loads only on the client. Tiles come from `mapTiles` (./tiles.ts), so the
 * provider can be swapped in one place.
 */
export function PinMap({
  pin,
  onPinChange,
  tiles = mapTiles,
  label,
  className = "h-64 w-full rounded-lg border",
}: {
  pin: Pin | null;
  onPinChange?: (pin: Pin) => void;
  tiles?: TileProvider;
  /** The map's accessible name. */
  label: string;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const handle = useRef<MapHandle | null>(null);
  const onChange = useRef(onPinChange);
  const latest = useRef(pin);
  const editable = onPinChange !== undefined;

  useEffect(() => {
    onChange.current = onPinChange;
    latest.current = pin;
  });

  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !container.current || handle.current) return;
      const start = latest.current;
      const map = L.map(container.current, { scrollWheelZoom: false }).setView(start ?? DEFAULT_MAP_CENTER, start ? 16 : 11);
      L.tileLayer(tiles.url, { attribution: tiles.attribution, maxZoom: tiles.maxZoom }).addTo(map);
      if (editable) map.on("click", (event) => onChange.current?.({ lat: event.latlng.lat, lng: event.latlng.lng }));
      handle.current = { L, map, marker: null, editable, onChange };
      placeMarker(handle.current, start);
    });
    return () => {
      cancelled = true;
      handle.current?.map.remove();
      handle.current = null;
    };
  }, [editable, tiles]);

  const lat = pin?.lat;
  const lng = pin?.lng;
  useEffect(() => {
    if (handle.current) placeMarker(handle.current, lat !== undefined && lng !== undefined ? { lat, lng } : null);
  }, [lat, lng]);

  return <div ref={container} role="region" aria-label={label} className={className} />;
}
