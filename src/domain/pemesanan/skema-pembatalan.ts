/**
 * The boundaries of a Pembatalan request of a paid Pemesanan Terencana (ticket 38): what the Pemegang Hak's
 * Server Actions and the Admin Lokasi's send. Nothing here reaches the database, so a `"use client"`
 * screen may take it, and every Server Action validates with these before it calls the module.
 */
import { z } from "zod";

const CATATAN_MAKS = 500;

/** "Ajukan Pembatalan" on one Hak Pakai of a paid Terencana order, with the reason in the family's words if it has one. */
export const ajukanPembatalanTerencanaSchema = z.object({
  hakPakaiId: z.uuid(),
  catatan: z.string().trim().max(CATATAN_MAKS).default(""),
});
export type AjukanPembatalanTerencanaInput = z.input<typeof ajukanPembatalanTerencanaSchema>;

/** Filing a request the Admin Lokasi sent back for a fix again, optionally with a new note. */
export const ajukanUlangPembatalanTerencanaSchema = z.object({
  id: z.uuid(),
  catatan: z.string().trim().max(CATATAN_MAKS).default(""),
});
export type AjukanUlangPembatalanTerencanaInput = z.input<typeof ajukanUlangPembatalanTerencanaSchema>;

/** The requester withdraws the request before a decision, or the Admin Lokasi approves it. */
export const permintaanPembatalanTerencanaSchema = z.object({ id: z.uuid() });
export type PermintaanPembatalanTerencanaInput = z.infer<typeof permintaanPembatalanTerencanaSchema>;

/** The Admin Lokasi declines, with the reason the family is told. */
export const tolakPembatalanTerencanaSchema = z.object({ id: z.uuid(), alasan: z.string().trim().min(1).max(CATATAN_MAKS) });
export type TolakPembatalanTerencanaInput = z.infer<typeof tolakPembatalanTerencanaSchema>;

/** The Admin Lokasi sends the request back, saying what has to be fixed. */
export const mintaPerbaikanPembatalanTerencanaSchema = z.object({ id: z.uuid(), catatan: z.string().trim().min(1).max(CATATAN_MAKS) });
export type MintaPerbaikanPembatalanTerencanaInput = z.infer<typeof mintaPerbaikanPembatalanTerencanaSchema>;
