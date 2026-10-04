import { test as dasar, expect, type BrowserContext, type Page } from "@playwright/test";
import { konteksBaru, pastikanMasuk } from "./masuk";
import type { NamaPersona } from "./persona";

export { expect };

/**
 * The journeys' `test`: `sebagai("admin-lokasi")` gives a page signed in as that
 * persona (its saved session, or a Masuk with the owner's code), `anonim()` a
 * visitor with no session. Both refuse any request to production.
 */
export const test = dasar.extend<{ sebagai: (nama: NamaPersona) => Promise<Page>; anonim: () => Promise<Page> }>({
  sebagai: async ({ browser }, pakai) => {
    const sesi = new Map<NamaPersona, Page>();
    const konteks: BrowserContext[] = [];
    await pakai(async (nama) => {
      const ada = sesi.get(nama);
      if (ada && !ada.isClosed()) return ada;
      const hasil = await pastikanMasuk(browser, nama);
      konteks.push(hasil.context);
      sesi.set(nama, hasil.page);
      return hasil.page;
    });
    await Promise.all(konteks.map((context) => context.close()));
  },
  anonim: async ({ browser }, pakai) => {
    const konteks: BrowserContext[] = [];
    await pakai(async () => {
      const context = await konteksBaru(browser);
      konteks.push(context);
      return context.newPage();
    });
    await Promise.all(konteks.map((context) => context.close()));
  },
});
