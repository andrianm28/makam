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
  email: string | null;
  /** Its phone number (a contact on the Akun); null until the Akun gives one. */
  phoneNumber: string | null;
}

/** The Kontak Siaga a Lokasi Mitra row names, while its Akun has been Admin Lokasi here without a break since the pick. */
async function kontakSiagaOfRow(
  identity: Identity,
  lokasiId: string,
  row: { kontakSiagaAccountId: string | null; kontakSiagaPickedAt: Date | null },
): Promise<KontakSiaga | null> {
  if (!row.kontakSiagaAccountId || !row.kontakSiagaPickedAt) return null;
  return identity.adminLokasiSince(row.kontakSiagaAccountId, lokasiId, row.kontakSiagaPickedAt);
}

/**
 * A Lokasi Mitra's Kontak Siaga (no actor: server code, e.g. alerts and the
 * order card), or null when none is picked or the picked Akun has not been
 * Admin Lokasi here without a break since the pick (removed, Dinonaktifkan, or
 * removed and invited again): then a new pick is needed.
 */
export async function kontakSiagaOf(deps: Pick<KontakSiagaDeps, "db" | "identity">, lokasiId: string): Promise<KontakSiaga | null> {
  if (!isLokasiId(lokasiId)) return null;
  const [row] = await deps.db
    .select({ kontakSiagaAccountId: lokasiMitra.kontakSiagaAccountId, kontakSiagaPickedAt: lokasiMitra.kontakSiagaPickedAt })
    .from(lokasiMitra)
    .where(eq(lokasiMitra.id, lokasiId));
  return row ? kontakSiagaOfRow(deps.identity, lokasiId, row) : null;
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
  return writeLokasiMitra(
    deps,
    by,
    lokasiId,
    "lokasi.pilih_kontak_siaga",
    async (row) => {
      const picked = (await deps.identity.adminLokasiOf(lokasiId)).find((account) => account.accountId === input.accountId);
      if (!picked) return { ok: false, reason: "bukan_admin_lokasi_di_sini" } as const;
      return {
        values: { kontakSiagaAccountId: picked.accountId, kontakSiagaPickedAt: deps.clock.now() },
        before: { kontakSiaga: await kontakSiagaOfRow(deps.identity, lokasiId, row) },
        after: { kontakSiaga: { ...picked } },
      };
    },
    "lokasi.atur_operasional",
  );
}
