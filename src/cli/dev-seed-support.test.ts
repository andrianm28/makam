/**
 * A dev seed asks for several Kode Masuk in a row, and a fixed Clock (a test's)
 * keeps every one of them inside the same 60 s per-IP window, so no two may
 * come from the same IP (ticket UAT 05: a random pick collided now and then
 * and the seed was refused with `tunggu_kirim_ulang`).
 */
import { describe, expect, it } from "vitest";
import { benchmarkingIp } from "./dev-seed-support";

describe("a dev seed's Kode Masuk requests", () => {
  it("never share an IP, so the per-IP 60 s wait cannot refuse a seed inside one 60 s window", () => {
    const ips = Array.from({ length: 200 }, () => benchmarkingIp());
    expect(new Set(ips).size).toBe(ips.length);
  });
});
