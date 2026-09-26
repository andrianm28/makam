import { eq } from "drizzle-orm";
import { lokasiMitraResource, writeRefusal, type Actor, type Identity, type WriteRefusal } from "@/domain/identity";
import { isLokasiId, writeLokasiMitra, type LokasiDeps, type NotFound, type WriteResult } from "./lokasi-mitra";
import { lokasiMitra } from "./schema";

export interface KontakSiagaDeps extends LokasiDeps {
  identity: Identity;
}

/** The Admin Lokasi a family can phone outside the Jam Operasional. */
export interface KontakSiaga {
  accountId: string;
  phoneNumber: string;
  email: string | null;
}

/**
 * A Lokasi Mitra's Kontak Siaga (no actor: server code, e.g. alerts and the
 * order card), or null when none is picked or the picked Akun is no longer
 * Admin Lokasi here (removed, Dinonaktifkan, or removed and invited again
 * since the pick): then a new pick is needed.
 */
export async function kontakSiagaOf(deps: Pick<KontakSiagaDeps, "db" | "identity">, lokasiId: string): Promise<KontakSiaga | null> {
  if (!isLokasiId(lokasiId)) return null;
  const [row] = await deps.db
    .select({ accountId: lokasiMitra.kontakSiagaAccountId, pickedAt: lokasiMitra.kontakSiagaPickedAt })
    .from(lokasiMitra)
    .where(eq(lokasiMitra.id, lokasiId));
  if (!row?.accountId || !row.pickedAt) return null;
  const pickedAt = row.pickedAt;
  const member = (await deps.identity.adminLokasiOf(lokasiId)).find(
    (account) => account.accountId === row.accountId && account.grantedAt.getTime() <= pickedAt.getTime(),
  );
  return member ? { accountId: member.accountId, phoneNumber: member.phoneNumber, email: member.email } : null;
}

export type KontakSiagaResult = { ok: true; kontakSiaga: KontakSiaga | null } | WriteRefusal | NotFound;

/** A Lokasi Mitra's Kontak Siaga, for Admin Platform or one of its Admin Lokasi. */
export async function readKontakSiaga(deps: KontakSiagaDeps, by: Actor, lokasiId: string): Promise<KontakSiagaResult> {
  const refusal = writeRefusal(by, "lokasi.lihat", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  return { ok: true, kontakSiaga: await kontakSiagaOf(deps, lokasiId) };
}

export type PickKontakSiagaResult = WriteResult | { ok: false; reason: "bukan_admin_lokasi_di_sini" };

/**
 * An Admin Lokasi (or Admin Platform) picks the Kontak Siaga: it must be one
 * of this Lokasi's Admin Lokasi; anyone else is refused. Audited on the Lokasi
 * with the Kontak Siaga before and after.
 */
export async function pickKontakSiaga(
  deps: KontakSiagaDeps,
  by: Actor,
  lokasiId: string,
  input: { accountId: string },
): Promise<PickKontakSiagaResult> {
  const refusal = writeRefusal(by, "lokasi.atur_operasional", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  if (!isLokasiId(lokasiId)) return { ok: false, reason: "tidak_ditemukan" };
  const picked = (await deps.identity.adminLokasiOf(lokasiId)).find((account) => account.accountId === input.accountId);
  if (!picked) return { ok: false, reason: "bukan_admin_lokasi_di_sini" };
  const before = await kontakSiagaOf(deps, lokasiId);
  const kontakSiaga: KontakSiaga = { accountId: picked.accountId, phoneNumber: picked.phoneNumber, email: picked.email };
  return writeLokasiMitra(
    deps,
    by,
    lokasiId,
    "lokasi.pilih_kontak_siaga",
    () => ({
      values: { kontakSiagaAccountId: picked.accountId, kontakSiagaPickedAt: deps.clock.now() },
      before: { kontakSiaga: before },
      after: { kontakSiaga },
    }),
    "lokasi.atur_operasional",
  );
}
