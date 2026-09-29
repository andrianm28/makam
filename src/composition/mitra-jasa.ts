import type { Identity, InviteStaffResult } from "@/domain/identity";
import type { Actor } from "@/domain/identity";
import type { BuatMitraJasaResult, Layanan } from "@/domain/layanan";

/**
 * Admin Platform onboards a Mitra Jasa: the record (Layanan) and the Undangan
 * Staf that lets its email log in with the role (Identity), as one call for a
 * Server Action.
 *
 * The two live in different modules with their own transactions, so they cannot
 * commit together. The order makes that safe: the record first (a role granted
 * for an address with no record would be a staff Akun with nothing behind it),
 * then the invite. A failure between the two leaves a record with no invite,
 * and this function is safe to call again with the same input: the record that
 * already exists for the same email and the same NIK is not a duplicate but the
 * first half of this very onboarding, so the retry sends the invite. A record
 * that is someone else's (another email, or another NIK on this email) is still
 * refused `sudah_ada`, and so is one whose invite is already out or accepted.
 */
export async function mulaiOnboardingMitraJasa(
  deps: { layanan: Pick<Layanan, "buatMitraJasa" | "semuaMitraJasa">; identity: Pick<Identity, "inviteStaff" | "openStaffInvites" | "staffAccounts"> },
  by: Actor,
  input: { email: string; nomorTelepon: string; profil: { nik: string } & Record<string, unknown> },
): Promise<BuatMitraJasaResult | Exclude<InviteStaffResult, { ok: true }>> {
  const dibuat = await deps.layanan.buatMitraJasa(by, input.email, input.profil);
  let hasil: BuatMitraJasaResult = dibuat;
  if (!dibuat.ok) {
    if (dibuat.reason !== "sudah_ada") return dibuat;
    const address = input.email.trim().toLowerCase();
    const ada = (await deps.layanan.semuaMitraJasa(by)).find((satu) => satu.email === address && satu.nik === String(input.profil.nik).trim());
    if (!ada) return dibuat;
    const undanganTerbuka = (await deps.identity.openStaffInvites()).some((undangan) => undangan.email === address && undangan.role === "mitra_jasa");
    const sudahBerperan = (await deps.identity.staffAccounts()).some((akun) => akun.email?.toLowerCase() === address && akun.roles.includes("mitra_jasa"));
    if (undanganTerbuka || sudahBerperan) return dibuat;
    hasil = { ok: true, mitraJasaId: ada.id };
  }
  const invited = await deps.identity.inviteStaff(by, { email: input.email, phoneNumber: input.nomorTelepon, role: "mitra_jasa" });
  if (!invited.ok) return invited;
  return hasil;
}
