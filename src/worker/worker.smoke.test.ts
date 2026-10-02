import { afterAll, afterEach, beforeEach, describe, expect, inject, it } from "vitest";
import { SystemClock } from "@/adapters/live/system-clock";
import { composeSchedulerContext } from "@/composition/scheduler";
import { scheduledTicks, workerHeartbeat } from "@/domain/scheduler";
import { resetDatabase, testDatabase } from "../../tests/support/database";
import { startWorker, type RunningWorker } from "./runtime";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

let worker: RunningWorker | undefined;
afterEach(async () => {
  await worker?.stop();
  worker = undefined;
});

async function eventually<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value) || Date.now() > deadline) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

describe("pg-boss wiring (smoke)", () => {
  it("runs the scheduled heartbeat tick end to end: schedule -> job -> tick -> heartbeat", async () => {
    const clock = new SystemClock();
    expect((await workerHeartbeat({ db }, clock.now())).lastBeatAt).toBeNull();

    worker = await startWorker({
      connectionString: inject("databaseUrl"),
      context: composeSchedulerContext({
        db,
        reportError: () => {},
        clock,
        dokumenUrl: (link) => `https://makam.test/dokumen/${link}`,
        notifications: {
          kirimPesanJatuhTempo: async () => ({ terkirim: 0, gagal: 0, ditunda: 0, dibatalkan: 0 }),
          chasingEskalasiTick: async () => ({ dieskalasi: 0 }),
          kirimPeringatanAntreanTick: async () => ({ dikirim: 0 }),
          kirimPeringatanStafTick: async () => ({ dikirim: 0 }),
        },
        lokasi: { serviceHoursDeadline: async () => ({ ok: false, reason: "jam_operasional_belum_diisi" as const }), kontakSiagaOf: async () => null },
        identity: { adminLokasiOf: async () => [] },
        // The Layanan module's payment effect re-run reads a grave's Hak Pakai; the smoke test pays nothing.
        inventory: { hakPakaiOfUnit: async () => null },
        notifikasi: {
          tagihanTerbit: async () => ({ ok: true as const, diingatkan: 0 }),
          pesananDiajukan: async () => {},
          peringatanStafSaatDuka: async () => {},
          pesananBelumDikonfirmasi: async () => {},
          pesananDikonfirmasi: async () => {},
          pesananDitolak: async () => {},
          pesananAlternatifDitawarkan: async () => {},
          pesananDibatalkan: async () => {},
          pesananBuktiPemesanan: async () => {},
          terencanaDiajukan: async () => {},
          terencanaDikonfirmasi: async () => {},
          terencanaDitolak: async () => {},
          terencanaBatasBayarLewat: async () => {},
          terencanaBukti: async () => {},
          pembatalanTerencana: async () => {},
          chasingDijadwalkan: async () => {},
          tidakTertagihDinyatakan: async () => {},
        },
        payouts: { tick: async () => ({ items: 0, potongan: 0, dilewati: 0 }), tickPotongan: async () => [] },
        refunds: { tick: async () => ({ materialised: 0 }) },
        layanan: { tinjauSkorTick: async () => {}, tandaiTidakDirespons: async () => 0, tutupJendelaKeluhan: async () => ({ ditutup: 0, pencairanJatuhTempo: 0 }), paketSiklusTick: async () => ({ diterbitkan: 0 }), batalkanPekerjaanTagihanLapse: async () => 0 },
        terencana: { lewatBatasBayarTick: async () => ({ dibatalkan: 0 }) },
        queues: { peringatanTick: async () => ({ diantrekan: 0 }), barisMasihTerbukaBelumDiambil: async () => true, barisMasihTerbuka: async () => true, bertugasTick: async () => ({ dimatikan: 0 }) },
      }),
      clock,
      ticks: scheduledTicks,
      // Same registry and wiring as production; only the cadence is faster
      // (every second instead of every minute) so the test stays quick.
      cronOverride: "* * * * * *",
      schedulerIntervalSeconds: 1,
      pollingIntervalSeconds: 0.5,
    });

    const heartbeat = await eventually(
      () => workerHeartbeat({ db }, clock.now()),
      (h) => h.isFresh,
      20_000,
    );

    expect(heartbeat.isFresh).toBe(true);
    expect(heartbeat.ageSeconds).toBeLessThan(5);
  }, 30_000);
});
