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
}

export const openStreetMapTiles: TileProvider = {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 19,
};

export const mapTiles: TileProvider = openStreetMapTiles;

/** Where an empty map opens: central Jakarta (Monas). */
export const DEFAULT_MAP_CENTER = { lat: -6.1754, lng: 106.8272 };
