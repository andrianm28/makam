import { z } from "zod";

/**
 * Info Kartu, client-safe (no database): what a Lokasi Mitra's big card on
 * "Pilih makam" says besides its name, address and photo (rapat Ira, 6 Nov
 * 2026): the agama it accepts (the agama filter reads it), a short
 * description, its luas lahan and whether it has a krematorium. Admin
 * Platform records it from the mitra's brosur; nothing is invented, so a
 * Lokasi Mitra starts with every part empty.
 */
export const agamaDiterima = ["islam", "kristen", "katolik", "hindu", "buddha", "konghucu"] as const;
export type Agama = (typeof agamaDiterima)[number];

export const labelAgama: Record<Agama, string> = {
  islam: "Islam",
  kristen: "Kristen",
  katolik: "Katolik",
  hindu: "Hindu",
  buddha: "Buddha",
  konghucu: "Konghucu",
};

export const infoKartuSchema = z.object({
  agama: z.array(z.enum(agamaDiterima)).max(agamaDiterima.length),
  deskripsi: z.string().trim().max(600),
  luasLahan: z.string().trim().max(60),
  krematorium: z.boolean(),
});
export type InfoKartu = z.infer<typeof infoKartuSchema>;

export const INFO_KARTU_KOSONG: InfoKartu = { agama: [], deskripsi: "", luasLahan: "", krematorium: false };
