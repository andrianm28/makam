import type { PengurusanDeps } from "@/domain/pengurusan/deps";

/**
 * The Layanan a Pengurusan fixture holds when the test adds no hari-H Layanan to its Saat Duka TPU order
 * (ticket 56): it prices nothing, schedules nothing and has nothing to cancel, and it fails loudly if a job is ever asked of it, so a
 * test that does add hari-H items must compose the real module (`layananOnTestDatabase`) instead.
 */
export const layananHariHKosong: PengurusanDeps["layanan"] = {
  barisHariHTpu: async () => ({ ok: true, baris: [], total: 0 }),
  batalkanHariHTpu: async () => ({ ok: true, dibatalkan: 0, baris: [], tidakDikembalikan: 0 }),
  jadwalkanHariHTpu: async () => {
    throw new Error("This fixture has no Layanan module: compose layananOnTestDatabase to add hari-H items");
  },
};
