/**
 * The map tiles behind every pin map (spec, Public site > Map / pin provider).
 * v1 uses OpenStreetMap's standard tiles; swapping provider (a paid tile
 * service, a self-hosted tile server) means changing only this object.
 */
export interface TileProvider {
  /** Leaflet URL template, e.g. https://tile.openstreetmap.org/{z}/{x}/{y}.png */
  url: string;
  /** Shown in the map corner, as the provider's licence requires. */
  attribution: string;
  maxZoom: number;
  /**
   * The tiles' own referrer policy. The site sends `Referrer-Policy: no-referrer`
   * (nginx and next.config.ts, so a Tagihan / Bukti link never leaks), but
   * OpenStreetMap blocks tile requests without a Referer ("403 Access blocked").
   * Only the tile images override it, and only to the site's origin.
   */
  referrerPolicy: Exclude<ReferrerPolicy, "">;
}

export const openStreetMapTiles: TileProvider = {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
  referrerPolicy: "strict-origin-when-cross-origin",
};

export const mapTiles: TileProvider = openStreetMapTiles;

/** Where an empty map opens: central Jakarta (Monas). */
export const DEFAULT_MAP_CENTER = { lat: -6.1754, lng: 106.8272 };
