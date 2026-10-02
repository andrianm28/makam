import { z } from "zod";

/**
 * The facilities checklist of a Lokasi Mitra, with the label shown to staff
 * and (later) on the Lokasi page. Confirmed on site by the Kunjungan
 * Verifikasi (ticket 15).
 */
export const lokasiFacilities = {
  parkir: "Parkir",
  musala: "Musala / masjid",
  toilet: "Toilet",
  air_bersih: "Air bersih",
  penerangan: "Penerangan malam",
  pos_jaga: "Pos jaga",
  akses_ambulans: "Akses mobil jenazah",
  tempat_duduk: "Tempat duduk / pendopo",
} as const;
export type LokasiFacility = keyof typeof lokasiFacilities;
const facilityKeys = Object.keys(lokasiFacilities) as [LokasiFacility, ...LokasiFacility[]];

const requiredText = (max: number) => z.string().trim().min(1).max(max);

/**
 * A Lokasi Mitra's profile as Admin Platform records it: the pin must lie in
 * Indonesia (a rough box around the archipelago).
 */
export const lokasiProfileSchema = z.object({
  name: requiredText(200),
  pengelolaName: requiredText(200),
  /** The pengelola's contact for the family at a Berhenti Lokasi; blank or absent clears it. The phone is normalised to +62 by the module. */
  pengelolaTelepon: z.string().trim().max(30).optional(),
  pengelolaEmail: z.string().trim().pipe(z.union([z.literal(""), z.email().max(200)])).optional(),
  address: requiredText(500),
  /** Kota or kabupaten. */
  city: requiredText(120),
  pin: z.object({ lat: z.number().min(-11.5).max(6.5), lng: z.number().min(94.5).max(141.5) }).nullable(),
  facilities: z.object({
    checked: z.array(z.enum(facilityKeys)).max(facilityKeys.length),
    note: z.string().trim().max(1000),
  }),
});
export type LokasiProfile = z.infer<typeof lokasiProfileSchema>;

/** A profile as typed in: the facilities are checked against `lokasiFacilities` by the module. */
export type LokasiProfileInput = Omit<LokasiProfile, "facilities"> & { facilities: { checked: string[]; note: string } };
