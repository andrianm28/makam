import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeFileStore } from "@/adapters/memory";
import { browser } from "../../../../../../../tests/support/next-request";
import { resetDatabase, testDatabase } from "../../../../../../../tests/support/database";
import { testServerRuntime } from "../../../../../../../tests/support/server-runtime";
import { signInAsAdminLokasi, signInAsAdminPlatform } from "../../../../../../../tests/support/server-sign-in";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../../../../tests/support/next-request"));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

const PDF = new TextEncoder().encode("%PDF-1.7\nperjanjian kerja sama\n%%EOF\n");

async function lokasiMitraWithScan() {
  const admin = await signInAsAdminPlatform(server);
  const { lokasi } = server.runtime();
  const created = await lokasi.createLokasiMitra(admin, {
    name: "Makam Wakaf Al-Ikhlas",
    pengelolaName: "Yayasan Al-Ikhlas",
    address: "Jl. Raya Pondok Rangon No. 1",
    city: "Kota Jakarta Timur",
  });
  if (!created.ok) throw new Error(created.reason);
  const uploaded = await lokasi.uploadAgreement(admin, created.lokasiMitra.id, {
    scan: { body: PDF, contentType: "application/pdf" },
    signedOn: "2026-09-20",
  });
  if (!uploaded.ok) throw new Error(uploaded.reason);
  return { admin, lokasiId: created.lokasiMitra.id };
}

const open = (lokasiId: string) =>
  GET(new Request(`http://localhost/staf/admin-platform/lokasi/${lokasiId}/perjanjian`), {
    params: Promise.resolve({ lokasiId }),
  });

describe("GET /staf/admin-platform/lokasi/<id>/perjanjian (the agreement scan)", () => {
  it("sends Admin Platform on to the scan's signed link (303, not cached); the file itself never passes through", async () => {
    const { lokasiId } = await lokasiMitraWithScan();

    const response = await open(lokasiId);

    expect(response.status).toBe(303);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const files = server.runtime().adapters.files as FakeFileStore;
    expect(files.open(response.headers.get("location")!)).toMatchObject({ body: PDF, contentType: "application/pdf" });
    expect(await response.text()).toBe("");
  });

  it("refuses that Lokasi's own Admin Lokasi (403) and a caller who is not signed in (401)", async () => {
    const { admin, lokasiId } = await lokasiMitraWithScan();
    await signInAsAdminLokasi(server, admin, lokasiId);

    const asAdminLokasi = await open(lokasiId);
    browser.reset();
    const signedOut = await open(lokasiId);

    expect(asAdminLokasi.status).toBe(403);
    expect(asAdminLokasi.headers.get("location")).toBeNull();
    expect(signedOut.status).toBe(401);
  });
});
