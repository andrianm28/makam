import { describe, expect, it } from "vitest";
import { directionsUrl, embedMapUrl, mapsQueryFor } from "./maps";

describe("the Google Maps query for a Lokasi or TPU (spec, Maps on public pages)", () => {
  it("is 'lat,lng' when there is a pin", () => {
    expect(mapsQueryFor({ pin: { lat: -6.301, lng: 106.901 }, address: "Jl. Raya Pondok Rangon No. 1" })).toBe(
      "-6.301,106.901",
    );
  });

  it("is the address text when there is no pin", () => {
    expect(mapsQueryFor({ pin: null, address: "Jl. Raya Pondok Rangon No. 1" })).toBe("Jl. Raya Pondok Rangon No. 1");
  });

  it("is null with neither a pin nor an address (a pin is never invented)", () => {
    expect(mapsQueryFor({ pin: null, address: "" })).toBeNull();
    expect(mapsQueryFor({ pin: null, address: "   " })).toBeNull();
  });
});

describe("the keyless Google Maps URLs built from that query", () => {
  it("embeds the query, output=embed, no API key", () => {
    expect(embedMapUrl("-6.301,106.901")).toBe("https://www.google.com/maps?q=-6.301%2C106.901&output=embed");
  });

  it("Petunjuk arah opens the maps app / web app with the same query", () => {
    expect(directionsUrl("-6.301,106.901")).toBe("https://www.google.com/maps/search/?api=1&query=-6.301%2C106.901");
  });

  it("encodes an address query safely", () => {
    expect(embedMapUrl("Jl. Raya Pondok Rangon No. 1")).toBe(
      "https://www.google.com/maps?q=Jl.%20Raya%20Pondok%20Rangon%20No.%201&output=embed",
    );
  });
});
