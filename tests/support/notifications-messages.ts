import type { IssueTagihanInput } from "@/domain/billing";
import type { Rupiah } from "@/lib/rupiah";
import { PENGATURAN_OPERATOR } from "./billing";
import { signedInAdminPlatform } from "./identity";
import { notificationsOnTestDatabase } from "./notifications";

/**
 * Shared fixtures for the family messages (ticket 20): a pay-first Perpanjangan
 * Tagihan announced the way a checkout does, on the setup Notifications shares
 * with Billing and identity.
 */

const rp = (amount: number) => amount as Rupiah;
const LOKASI = { kind: "lokasi_mitra", lokasiId: "7a0c5a52-0000-4000-8000-000000000001", name: "Taman Makam Contoh" } as const;

/** A pay-first Perpanjangan checkout: due 3×24 h after issue. */
export function perpanjanganCheckout(overrides: Partial<IssueTagihanInput> = {}): IssueTagihanInput {
  return {
    moment: { kind: "perpanjangan" },
    addressee: { name: "Ahmad Fauzi", phoneNumber: "081298765432", accountId: null },
    nomorPemesanan: null,
    placeName: "Taman Makam Contoh",
    lines: [
      { kind: "perpanjangan", label: "Perpanjangan Makam – Makam Standar (1 × 5 tahun)", amount: rp(750_000), provider: LOKASI },
      { kind: "biaya_layanan_platform", label: "Biaya Layanan Platform", amount: rp(150_000), provider: { kind: "operator" } },
    ],
    ...overrides,
  };
}

export type NotificationsSetup = ReturnType<typeof notificationsOnTestDatabase>;

/** Just the parts these fixtures drive, so the fuller setups (Queues, Antrean) can use them too. */
export type PesanSetup = Pick<
  NotificationsSetup,
  "billing" | "notifications" | "operatorSettings" | "clock" | "identity" | "email" | "files" | "audit"
>;

/** Pengaturan Operator entered by the first Admin Platform, as every document needs it. */
export async function siapkanOperator(setup: PesanSetup) {
  const { actor: admin } = await signedInAdminPlatform(setup);
  const changed = await setup.operatorSettings.change(admin, { ...PENGATURAN_OPERATOR, reason: null });
  if (!changed.ok) throw new Error(`Pengaturan Operator refused: ${changed.reason}`);
  return { admin };
}

/** Issues a pay-first Perpanjangan Tagihan (due 3×24 h after issue) and announces it to `email` (null: a CS order with no email). */
export async function terbitkanPerpanjangan(setup: PesanSetup, email: string | null) {
  const issued = await setup.billing.issueTagihan(perpanjanganCheckout());
  if (!issued.ok) throw new Error(`Tagihan refused: ${issued.reason}`);
  const tagihan = issued.tagihan;
  const announced = await setup.notifications.tagihanTerbit({
    tagihanId: tagihan.id,
    nomorTagihan: tagihan.nomorTagihan,
    kind: tagihan.kind,
    momentKind: "perpanjangan",
    nomorPemesanan: tagihan.nomorPemesanan,
    email,
    perihal: "Perpanjangan Makam di Taman Makam Contoh",
    total: tagihan.total,
    issuedAt: tagihan.issuedAt,
    dueAt: tagihan.dueAt,
    link: tagihan.link,
    placeName: tagihan.placeName,
  });
  if (!announced.ok) throw new Error(`announce refused: ${announced.reason}`);
  return { tagihan, diingatkan: announced.diingatkan };
}
