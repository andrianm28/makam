import type { Database } from "@/db/client";
import type { Pemesanan, PemesananNotifikasi, Pemesan } from "@/domain/pemesanan";
import { createPemesanan } from "@/domain/pemesanan";
import { logIn } from "./identity";
import { publishOnTestDatabase, type PublishSetup } from "./publish";
import type { TerencanaLokasi } from "./terencana";

/** What the Pemesanan module announced through Notifications, recorded so a test can read it. */
export interface NotifikasiPencatat extends PemesananNotifikasi {
  /** Every order announced, in the order it was announced. */
  readonly diumumkan: { nomor: string; lokasiId: string; email: string }[];
}

/**
 * The Pemesanan module on the test Postgres, next to Lokasi, Tariffs, Inventory
 * and Billing, sharing their fake Clock and Audit Log. The Notifications seam is a
 * recording stand-in; ticket 20 builds the real one.
 */
export function pemesananOnTestDatabase(db: Database): PublishSetup & { pemesanan: Pemesanan; notifikasi: NotifikasiPencatat } {
  const setup = publishOnTestDatabase(db);
  const diumumkan: { nomor: string; lokasiId: string; email: string }[] = [];
  const notifikasi: NotifikasiPencatat = {
    pemesananTerencanaDiajukan: async (order) => {
      diumumkan.push(order);
    },
    diumumkan,
  };
  const pemesanan = createPemesanan({
    db,
    clock: setup.clock,
    lokasi: setup.lokasi,
    tariffs: setup.tariffs,
    inventory: setup.inventory,
    billing: setup.billing,
    identity: setup.identity,
    notifikasi,
  });
  return { ...setup, pemesanan, notifikasi };
}

export type PemesananSetup = ReturnType<typeof pemesananOnTestDatabase>;

/**
 * A Pemesan: an Akun created by the Kode Masuk of an email, as the wizard's
 * Kirim does, with the phone number "Data & kirim" collects.
 */
export async function pemesan(setup: PemesananSetup, email = "kelarga@contoh.id"): Promise<Pemesan> {
  const { cookies } = await logIn(setup, email, { phoneNumber: "081234567890" });
  const actor = await setup.identity.actorFromCookies(cookies);
  if (!actor) throw new Error("not signed in");
  return { accountId: actor.accountId, email: actor.email };
}

/** The ids of the Petak Makam and Kavling Keluarga the fixture's Denah shows, by the number they are known by. */
export async function unitIds(setup: PemesananSetup, fixture: TerencanaLokasi, nomor: readonly string[]): Promise<Record<string, string>> {
  const denah = await setup.inventory.publicDenah(fixture.lokasiMitra.id);
  const cells = denah?.bloks.flatMap((blok) => blok.cells) ?? [];
  const kavling = denah?.bloks.flatMap((blok) => blok.kavling) ?? [];
  const found = await Promise.all(
    nomor.map(async (satu) => {
      const id = cells.find((cell) => cell.nomorMakam === satu)?.id ?? kavling.find((satu2) => satu2.nomorKavling === satu)?.id;
      if (!id) throw new Error(`no unit ${satu}`);
      return [satu, id] as const;
    }),
  );
  return Object.fromEntries(found);
}
