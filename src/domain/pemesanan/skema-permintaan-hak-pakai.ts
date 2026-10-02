/**
 * The boundaries of a Pengembalian Hak Pakai or Ganti Pemegang Hak request (ticket 39): what the
 * Pemegang Hak's Server Actions and the Admin Lokasi's send. Nothing here reaches the database, so a
 * `"use client"` screen may take it, and every Server Action validates with these before it calls the
 * module.
 */
import { z } from "zod";

const CATATAN_MAKS = 500;

/** "Kembalikan Hak Pakai" on one unused Hak Pakai, with the family's own note if it has one. */
export const ajukanPengembalianSchema = z.object({
  hakPakaiId: z.uuid(),
  catatan: z.string().trim().max(CATATAN_MAKS).default(""),
});
export type AjukanPengembalianInput = z.input<typeof ajukanPengembalianSchema>;

/** "Ajukan Ganti Pemegang Hak": the new holder and why the right changes hands, with any documents attached. */
export const ajukanGantiPemegangHakSchema = z.object({
  hakPakaiId: z.uuid(),
  pemegangBaru: z.object({
    name: z.string().trim().min(1).max(200),
    phoneNumber: z.string().trim().min(1).max(30),
    email: z.string().trim().max(320).optional(),
  }),
  sebab: z.enum(["jual", "waris"]),
  dokumen: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  catatan: z.string().trim().max(CATATAN_MAKS).default(""),
});
export type AjukanGantiPemegangHakInput = z.input<typeof ajukanGantiPemegangHakSchema>;

/** Filing a request the Admin Lokasi sent back for a fix again, optionally with a new note. */
export const ajukanUlangPermintaanHakPakaiSchema = z.object({
  id: z.uuid(),
  catatan: z.string().trim().max(CATATAN_MAKS).default(""),
});
export type AjukanUlangPermintaanHakPakaiInput = z.input<typeof ajukanUlangPermintaanHakPakaiSchema>;

/** The requester withdraws the request before a decision. */
export const permintaanHakPakaiIdSchema = z.object({ id: z.uuid() });
export type PermintaanHakPakaiIdInput = z.infer<typeof permintaanHakPakaiIdSchema>;

/** The Admin Lokasi declines, with the reason the family is told. */
export const tolakPermintaanHakPakaiSchema = z.object({ id: z.uuid(), alasan: z.string().trim().min(1).max(CATATAN_MAKS) });
export type TolakPermintaanHakPakaiInput = z.infer<typeof tolakPermintaanHakPakaiSchema>;

/** The Admin Lokasi sends the request back, saying what has to be fixed. */
export const mintaPerbaikanPermintaanHakPakaiSchema = z.object({ id: z.uuid(), catatan: z.string().trim().min(1).max(CATATAN_MAKS) });
export type MintaPerbaikanPermintaanHakPakaiInput = z.infer<typeof mintaPerbaikanPermintaanHakPakaiSchema>;

/** The Admin Lokasi approves: for a Ganti, the offline fee it collected (omitted is zero). */
export const setujuiPermintaanHakPakaiSchema = z.object({
  id: z.uuid(),
  biayaGantiOffline: z.number().int().nonnegative().max(1_000_000_000).optional(),
});
export type SetujuiPermintaanHakPakaiInput = z.infer<typeof setujuiPermintaanHakPakaiSchema>;

/** The Pemegang Hak sets or clears one plot's Calon Penghuni label. */
export const ubahCalonPenghuniSchema = z.object({
  hakPakaiId: z.uuid(),
  /** The Petak labelled; omitted for a Hak Pakai on one Petak, required for a Kavling Keluarga's. */
  petakId: z.uuid().optional(),
  label: z.string().trim().max(200).nullable(),
});
export type UbahCalonPenghuniInput = z.infer<typeof ubahCalonPenghuniSchema>;
