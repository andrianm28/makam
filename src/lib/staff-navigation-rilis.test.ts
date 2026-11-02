import { describe, expect, it } from "vitest";
import { staffRoles } from "@/domain/identity";
import { staffMenu } from "./staff-navigation";

describe("Staff menu by release (ADR 0006)", () => {
  it("every item of every role's menu belongs to a mapped release, so the level that opens even what ADR 0012 took out hides nothing", () => {
    for (const role of staffRoles) {
      for (const lokasiId of [undefined, "lok-1"]) {
        expect(staffMenu(role, { lokasiId, rilis: 4 }), `${role} ${lokasiId}`).toEqual(staffMenu(role, { lokasiId }));
      }
    }
  });

  it("at Rilis 1 Admin Platform's menu hides the TPU, Mitra Jasa and Wakaf items and keeps the rest", () => {
    const labels = staffMenu("admin_platform", { rilis: 1 }).flatMap((group) => group.items.map((item) => item.label));
    expect(labels).toContain("Tagihan");
    for (const closed of ["Pekerjaan TPU", "Wakaf Tanah", "TPU DKI", "Mitra Jasa"]) expect(labels).not.toContain(closed);
  });

  it("at Rilis 3 Admin Platform's menu shows Wakaf Tanah but none of the TPU and Mitra Jasa items taken out of the product (ADR 0012)", () => {
    const labels = staffMenu("admin_platform", { rilis: 3 }).flatMap((group) => group.items.map((item) => item.label));
    expect(labels).toContain("Wakaf Tanah");
    for (const closed of ["Pekerjaan TPU", "TPU DKI", "Mitra Jasa"]) expect(labels).not.toContain(closed);
  });
});
