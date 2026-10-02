/**
 * The Berhenti effective-date tick (spec, Lokasi > Berhenti; Scheduler > effective dates; ticket 59). On and after
 * the date a Lokasi Mitra's Berhenti takes effect, once: its unfinished Pekerjaan Layanan are cancelled with full
 * refunds (Layanan), its Potongan become offline requests and the held Pencairan of its paid Pemesanan Terencana are
 * released (Payouts). The Lokasi is marked settled only when nothing is left waiting (a refund Refunds could not take
 * yet), so the next run takes the rest. Every step is idempotent, so a tick that runs twice changes nothing.
 */
import type { Layanan } from "@/domain/layanan";
import type { Lokasi } from "@/domain/lokasi";
import type { Payouts } from "@/domain/payouts";
import type { Pemesanan } from "@/domain/pemesanan";

export interface BerhentiContext {
  lokasi: Pick<Lokasi, "berhentiBerlakuBelumDiproses" | "tandaiBerhentiDiproses">;
  layanan: Pick<Layanan, "batalkanSisaBerhenti">;
  payouts: Pick<Payouts, "potonganBerhenti" | "lepaskanTerencanaBerhenti">;
  terencana: Pick<Pemesanan, "nomorTerencanaAktifDiLokasi">;
}

export async function berhentiBerlakuTick(ctx: BerhentiContext, _now: Date): Promise<void> {
  for (const lokasiId of await ctx.lokasi.berhentiBerlakuBelumDiproses()) {
    const layanan = await ctx.layanan.batalkanSisaBerhenti(lokasiId);
    await ctx.payouts.potonganBerhenti(lokasiId);
    await ctx.payouts.lepaskanTerencanaBerhenti(await ctx.terencana.nomorTerencanaAktifDiLokasi(lokasiId));
    if (layanan.tertunda === 0) await ctx.lokasi.tandaiBerhentiDiproses(lokasiId);
  }
}
