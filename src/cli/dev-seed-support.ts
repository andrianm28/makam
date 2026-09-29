/**
 * Shared plumbing for the development-only seed commands (`seed-saat-duka`,
 * `seed-contoh-publik`): the module bundle each drives through its own
 * public functions, the "act as the stack's first Admin Platform" pattern
 * (never copy this actor-building into app code — AGENTS.md), a throwaway
 * agreement scan, a fresh benchmarking IP per Kode Masuk request, and the
 * invite + Kode Masuk login flow that gets a fixture's own Admin Lokasi or
 * Petugas Lapangan Akun signed in as a real Actor.
 */
import { FakeEmailSender } from "@/adapters/memory";
import type { Database } from "@/db/client";
import type { Fieldwork } from "@/domain/fieldwork";
import type { Actor, Identity } from "@/domain/identity";
import type { Inventory } from "@/domain/inventory";
import type { Lokasi } from "@/domain/lokasi";
import type { OperatorSettings } from "@/domain/operator-settings";
import type { Tariffs } from "@/domain/tariffs";
import type { Adapters } from "@/ports";

/** The modules a dev seed command drives, each through its own public functions. */
export interface Modul {
  db: Database;
  adapters: Adapters;
  identity: Identity;
  lokasi: Lokasi;
  tariffs: Tariffs;
  inventory: Inventory;
  fieldwork: Fieldwork;
}

export type Gagal = { ok: false; reason: string };

/** A throwaway agreement scan: enough to satisfy the publish gate's "scan uploaded" fact, never a real document. */
export const scanPerjanjian = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3]);

/**
 * The stack's first Admin Platform (seeded by `seed:admin`) as a local
 * developer with the stack's shell could act. Never on production, and on
 * staging only for a command run under its explicit `--izinkan-staging`
 * (seed-contoh-publik); every other command refuses staging before this.
 */
export async function adminPlatform(identity: Identity): Promise<Actor | null> {
  const admin = (await identity.staffAccounts()).find((account) => account.roles.includes("admin_platform") && !account.deactivated);
  if (!admin) return null;
  return {
    accountId: admin.accountId,
    email: admin.email ?? "",
    phoneNumber: admin.phoneNumber,
    roles: ["admin_platform"],
    lokasiIds: [],
    totp: "lolos",
    sessionId: `dev-seed-${admin.accountId}`,
  };
}

/** A fresh benchmarking IP per Kode Masuk request: the per-IP limit allows one per 60 s, and a fixture sends several in a row. */
export function benchmarkingIp(): string {
  return `198.18.${1 + Math.floor(Math.random() * 4)}.${1 + Math.floor(Math.random() * 250)}`;
}

/**
 * Signs an already-invited email in with its Kode Masuk (from the fake
 * EmailSender), as a real Actor. `name`, when given, is the same optional
 * name a wizard's Kirim passes to `verifyKodeMasuk`: it fills the Akun's name
 * the way a family member's own Kirim would, never overwriting one that is
 * already there (`identity`'s own rule, `kode-masuk.ts`).
 */
export async function masukDenganKodeMasuk(modul: Modul, email: string, name?: string): Promise<{ ok: true; value: Actor } | Gagal> {
  const { identity, adapters } = modul;
  const sent = await identity.requestKodeMasuk({ email, ip: benchmarkingIp() });
  if (!sent.ok) return { ok: false, reason: sent.reason };
  const code = (adapters.email as FakeEmailSender).sent
    .filter((message) => message.to === sent.email)
    .at(-1)
    ?.text.match(/\b(\d{6})\b/)?.[1];
  if (!code) return { ok: false, reason: "kode_tidak_terkirim" };
  const login = await identity.verifyKodeMasuk({ email, code, name });
  if (!login.ok) return { ok: false, reason: login.reason };
  const cookies = login.session.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  const actor = await identity.actorFromCookies(cookies);
  return actor ? { ok: true, value: actor } : { ok: false, reason: "belum_masuk" };
}

/**
 * Invites a fixture Akun through `invite` (the caller's own call into Lokasi's
 * `inviteAdminLokasi` or Identity's `inviteStaff`, whichever role this is),
 * then signs it in with its Kode Masuk, as a real Actor. `name` is threaded
 * straight through to `masukDenganKodeMasuk`.
 */
export async function masukSebagai(
  modul: Modul,
  email: string,
  invite: () => Promise<{ ok: true } | { ok: false; reason: string }>,
  name?: string,
): Promise<{ ok: true; value: Actor } | Gagal> {
  const invited = await invite();
  if (!invited.ok) return { ok: false, reason: invited.reason };
  return masukDenganKodeMasuk(modul, email, name);
}

/**
 * The one example Pengaturan Operator every dev seed shares (`seed-tagihan`,
 * `seed-contoh-publik`): its CS contact is the public-site prototype's own
 * `CS` constant (`_mock/data.ts`: wa.me/6281100000000, 0811-0000-0000, "setiap
 * hari, 06.00–22.00 WIB"), so whichever seed runs first enters the same values.
 */
export const CONTOH_PENGATURAN_OPERATOR = {
  legalName: "PT Jaya Korpora Prima",
  address: "Jl. Contoh No. 1, Jakarta Selatan 12345",
  phone: "0811-0000-0000",
  email: "halo@makam.co.id",
  csWhatsApp: "0811-0000-0000",
  csReplyHours: "setiap hari, 06.00–22.00 WIB",
};

/** The Operator's flat platform fee (spec: Biaya Layanan Platform), as the prototype's mock has it. */
export const BIAYA_LAYANAN_PLATFORM_CONTOH = 250_000;

/**
 * Enters the example Pengaturan Operator only when there is none yet, never
 * overwriting what an Operator (or the other seed) entered, through its public
 * functions. `reason` carries the caller's staging allowance where it has one.
 */
export async function isiPengaturanOperatorBilaKosong(
  operatorSettings: OperatorSettings,
  admin: Actor,
  reason: string,
): Promise<{ ok: true } | Gagal> {
  if (await operatorSettings.current()) return { ok: true };
  const entered = await operatorSettings.change(admin, { ...CONTOH_PENGATURAN_OPERATOR, reason });
  return entered.ok ? { ok: true } : { ok: false, reason: entered.reason };
}
