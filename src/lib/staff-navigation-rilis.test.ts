import { describe, expect, it } from "vitest";
import { staffRoles } from "@/domain/identity";
import { staffMenu } from "./staff-navigation";

describe("Staff menu by release (ADR 0006)", () => {
  it("every item of every role's menu belongs to a mapped release, so Rilis 3 hides nothing", () => {
    for (const role of staffRoles) {
      for (const lokasiId of [undefined, "lok-1"]) {
        expect(staffMenu(role, { lokasiId, rilis: 3 }), `${role} ${lokasiId}`).toEqual(staffMenu(role, { lokasiId }));
      }
    }
  });

  it("at Rilis 1 Admin Platform's menu hides the TPU, Mitra Jasa and Wakaf items and keeps the rest", () => {
    const labels = staffMenu("admin_platform", { rilis: 1 }).flatMap((group) => group.items.map((item) => item.label));
    expect(labels).toContain("Tagihan");
    for (const closed of ["Pekerjaan TPU", "Wakaf Tanah", "TPU DKI", "Mitra Jasa"]) expect(labels).not.toContain(closed);
  });
});
