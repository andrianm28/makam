/**
 * Setor Retribusi (spec, Work Queues Tier 3 and Tariffs; ticket 45, AC 7 and its
 * 2026-09-25 addition). A family's Retribusi Pemda is paid on to the town, so
 * every Lunas Tagihan carrying a non-zero line opens a row due two working days
 * later, and recording the payment with its proof closes it.
 *
 * Read only through the Field Work module's public functions, Billing's own
 * Retribusi read and the Antrean row they are projected into. Every Retribusi is
 * Rp 0 today, so the non-zero case is entered as a tariff version, the way Admin
 * Platform would.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { queuesOnTestDatabase } from "../../../tests/support/queues";
import { orderSaatDukaTpu, saatDukaTpuFixture } from "../../../tests/support/pengurusan";
import { siapkanOperatorPemesanan } from "../../../tests/support/pemesanan";
import { signedInPetugasLapangan } from "../../../tests/support/publish";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

/** The receipt a town's office hands over, as a phone photo of one page really is. */
const bukti = () => ({ body: new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]), contentType: "image/jpeg" });

/** A confirmed Saat Duka TPU order whose Tagihan is Lunas, through the public functions. */
async function lunasDenganRetribusi(setup: ReturnType<typeof queuesOnTestDatabase>, retribusi: number) {
  const admin = await siapkanOperatorPemesanan(setup);
  const petugas = await signedInPetugasLapangan(setup, admin, `petugas.retribusi@contoh.id`);
  setup.clock.set(wib("2026-10-01 10:00"));
  const fixture = await saatDukaTpuFixture(setup);
  // Entered after the fixture own tariffs, which put the Retribusi at Rp 0: this
  // is a new version of the same tariff, as Admin Platform would, and it is what a
  // town Ordinance would turn on.
  if (retribusi !== 0) {
    const masuk = await setup.tariffs.setGlobalTariff(admin, {
      key: "retribusi_pemda_iptm",
      amount: retribusi,
      effectiveOn: "2026-10-01",
      reason: "Perda baru",
    });
    if (!masuk.ok) throw new Error(`tarif refused: ${masuk.reason}`);
  }
  setup.clock.set(wib("2026-10-01 10:00"));
  await setup.pengurusan.placeSaatDukaTpu(orderSaatDukaTpu(fixture));
  const hasil = await setup.pengurusan.konfirmasiSaatDukaTpu(admin, {
    nomor: "MKM-2026-000001",
    pemakamanAt: "2026-10-02 09:00",
    kontakTpu: { name: "Petugas TPU Kober", phoneNumber: "0218501234" },
    petugasAccountId: petugas.accountId,
    catatan: "",
  });
  if (!hasil.ok) throw new Error(`konfirmasi refused: ${hasil.reason}`);
  const bayar = await setup.billing.recordPayment(hasil.tagihan.id, {
    method: { kind: "penyedia_pembayaran", channel: "qris" },
    reference: "QRIS-0001",
  });
  if (!bayar.ok) throw new Error(`payment refused: ${bayar.reason}`);
  return { admin, petugas, tagihanId: hasil.tagihan.id, nomorTagihan: hasil.tagihan.nomorTagihan };
}

describe("the Setor Retribusi row", () => {
  it("is not opened at all by a Rp 0 Retribusi, which is the only one in force today", async () => {
    const setup = queuesOnTestDatabase(db);
    const { tagihanId } = await lunasDenganRetribusi(setup, 0);

    // The Tagihan is Lunas, but the town is owed nothing, so there is no row.
    expect(await setup.fieldwork.setorRetribusiTerbuka()).toEqual([]);
    // And nothing can be recorded as paid to a town for it either.
    setup.clock.set(wib("2026-10-06 09:00"));
    const admin = await siapkanOperatorPemesanan(setup);
    expect(
      await setup.fieldwork.catatSetorRetribusi(admin, {
        tagihanId,
        dibayarkanPada: "2026-10-05",
        bukti: bukti(),
        catatan: "",
      }),
    ).toEqual({ ok: false, reason: "tagihan_tidak_ada" });
  });

  it("is opened by a non-zero Retribusi, due two working days after Lunas on the Admin Platform calendar", async () => {
    const setup = queuesOnTestDatabase(db);
    const { tagihanId, nomorTagihan } = await lunasDenganRetribusi(setup, 250_000);

    const terbuka = await setup.fieldwork.setorRetribusiTerbuka();
    expect(terbuka).toEqual([
      {
        tagihanId,
        nomorTagihan,
        nomorPemesanan: "MKM-2026-000001",
        placeName: "TPU Kober",
        lunasAt: wib("2026-10-01 10:00"),
        amount: 250_000,
        dueAt: wib("2026-10-05 23:59"),
        tugasLapanganId: null,
        assigneeAccountId: null,
      },
    ]);
  });

  it("appears in the Antrean as a Tier 3 row, and closes on the recorded setoran", async () => {
    const setup = queuesOnTestDatabase(db);
    const { admin, tagihanId } = await lunasDenganRetribusi(setup, 250_000);

    const rows = (await setup.queues.antrean(admin)).filter((row) => row.type === "setor_retribusi");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tier: 3, alerts: false, href: "/staf/admin-platform/setor-retribusi" });
    // Lunas on Thursday 1 October 2026: two working days later skips the weekend
    // and lands on Monday the 5th at 23:59 WIB, counted by Lokasi own calendar
    // (Monday-Friday less the Hari Libur Nasional list) and never by a second
    // rule here.
    expect(rows[0].deadline).toEqual(wib("2026-10-05 23:59"));
    setup.clock.set(wib("2026-10-05 09:00"));

    const tercatat = await setup.fieldwork.catatSetorRetribusi(admin, {
      tagihanId,
      dibayarkanPada: "2026-10-05",
      bukti: bukti(),
      catatan: "No. 1234",
    });
    expect(tercatat).toMatchObject({ ok: true, setor: { nomorTagihan: expect.any(String), amount: 250_000 } });

    // The row closes itself: it was a projection of the state the recording
    // changed, so nothing in the queue had to know about the payment.
    expect((await setup.queues.antrean(admin)).filter((row) => row.type === "setor_retribusi")).toEqual([]);
    expect(await setup.fieldwork.setorRetribusiTerbuka()).toEqual([]);
    // A town is paid once: a second recording of the same Tagihan is refused.
    expect(
      await setup.fieldwork.catatSetorRetribusi(admin, {
        tagihanId,
        dibayarkanPada: "2026-10-05",
        bukti: bukti(),
        catatan: "",
      }),
    ).toEqual({ ok: false, reason: "sudah_disetor" });
  });

  it("is recorded by the Petugas who paid in person, and their proof closes the row", async () => {
    const setup = queuesOnTestDatabase(db);
    const { admin, petugas, tagihanId, nomorTagihan } = await lunasDenganRetribusi(setup, 250_000);

    // Admin Platform hands the setor to one Petugas as a "Setor Retribusi" Tugas.
    const tugas = await setup.fieldwork.createTugasLapangan(admin, {
      type: "setor_retribusi",
      subject: `Setor Retribusi ${nomorTagihan}`,
      lokasiId: null,
      address: "Kantor Dinastegeran",
      pin: null,
      plannedDate: "2026-10-05",
      assigneeAccountId: petugas.accountId,
      tagihanId,
    });
    if (!tugas.ok) throw new Error(`tugas refused: ${tugas.reason}`);
    expect(tugas.tugasLapangan.tagihanId).toBe(tagihanId);

    // The row names who is going, from the Taske's own row.
    const terbuka = await setup.fieldwork.setorRetribusiTerbuka();
    expect(terbuka[0]).toMatchObject({ tugasLapanganId: tugas.tugasLapangan.id, assigneeAccountId: petugas.accountId });

    // Selesai is refused without the proof: the receipt is the whole point.
    expect(
      await setup.fieldwork.completeTugasLapangan(petugas, tugas.tugasLapangan.id, {
        form: { dibayarkanPada: "2026-10-05", catatan: "" },
        uploads: [],
      }),
    ).toEqual({ ok: false, reason: "unggah_kurang" });

    const selesai = await setup.fieldwork.completeTugasLapangan(petugas, tugas.tugasLapangan.id, {
      form: { dibayarkanPada: "2026-10-05", catatan: "No. 1234" },
      uploads: [{ kind: "bukti_setor", file: bukti() }],
    });
    expect(selesai.ok).toBe(true);

    // The proof the Petugas uploaded is the recording's evidence, and the row
    // closes without Admin Platform touching anything.
    expect((await setup.queues.antrean(admin)).filter((row) => row.type === "setor_retribusi")).toEqual([]);
    expect(await setup.fieldwork.setorRetribusiTerbuka()).toEqual([]);
  });

  it("refuses the Petugas's completion with its own reason when the town is already paid", async () => {
    const setup = queuesOnTestDatabase(db);
    const { admin, petugas, tagihanId, nomorTagihan } = await lunasDenganRetribusi(setup, 250_000);
    setup.clock.set(wib("2026-10-05 09:00"));

    // Admin Platform hands the setor to one Petugas as a "Setor Retribusi" Tugas...
    const tugas = await setup.fieldwork.createTugasLapangan(admin, {
      type: "setor_retribusi",
      subject: `Setor Retribusi ${nomorTagihan}`,
      lokasiId: null,
      address: "Kantor Dinastegeran",
      pin: null,
      plannedDate: "2026-10-05",
      assigneeAccountId: petugas.accountId,
      tagihanId,
    });
    if (!tugas.ok) throw new Error(`tugas refused: ${tugas.reason}`);

    // ...and then pays the town themselves, so that Tagihan is recorded already.
    const tercatat = await setup.fieldwork.catatSetorRetribusi(admin, {
      tagihanId,
      dibayarkanPada: "2026-10-05",
      bukti: bukti(),
      catatan: "No. 1234",
    });
    expect(tercatat.ok).toBe(true);

    // The Petugas completes the same Tugas with their receipt, and the answer is
    // "the town is already paid for this Tagihan" — not "this Tagihan never went
    // to a town". The two send the Petugas to different people, so the second is
    // never folded into the first.
    expect(
      await setup.fieldwork.completeTugasLapangan(petugas, tugas.tugasLapangan.id, {
        form: { dibayarkanPada: "2026-10-05", catatan: "No. 1234" },
        uploads: [{ kind: "bukti_setor", file: bukti() }],
      }),
    ).toEqual({ ok: false, reason: "sudah_disetor" });

    // Nothing moved: the completion rolled back whole, so the Tugas is still the
    // Petugas's to hand back, and the single recording that exists is still that one.
    const [milikPetugas] = await setup.fieldwork.tugasSaya(petugas);
    expect(milikPetugas.status).toBe("ditugaskan");
    expect(
      await setup.fieldwork.catatSetorRetribusi(admin, {
        tagihanId,
        dibayarkanPada: "2026-10-05",
        bukti: bukti(),
        catatan: "",
      }),
    ).toEqual({ ok: false, reason: "sudah_disetor" });
  });

  it("refuses a date in the future, and a proof that is not a photo or a scan", async () => {
    const setup = queuesOnTestDatabase(db);
    const { admin, tagihanId } = await lunasDenganRetribusi(setup, 250_000);
    setup.clock.set(wib("2026-10-05 09:00"));

    expect(
      await setup.fieldwork.catatSetorRetribusi(admin, {
        tagihanId,
        dibayarkanPada: "2026-12-31",
        bukti: bukti(),
        catatan: "",
      }),
    ).toEqual({ ok: false, reason: "tanggal_di_masa_depan" });
    expect(
      await setup.fieldwork.catatSetorRetribusi(admin, {
        tagihanId,
        dibayarkanPada: "2026-10-05",
        bukti: { body: new Uint8Array([1, 2, 3]), contentType: "application/zip" },
        catatan: "",
      }),
    ).toEqual({ ok: false, reason: "berkas_tidak_didukung" });
    // A Petugas who is not a staff member of the roster cannot record it either.
    expect(
      await setup.fieldwork.catatSetorRetribusi(
        { accountId: "bukan-akun", email: "bukan@contoh.id", phoneNumber: null, roles: ["pemesan"], lokasiIds: [], totp: "tidak_perlu", sessionId: "s" },
        { tagihanId, dibayarkanPada: "2026-10-05", bukti: bukti(), catatan: "" },
      ),
    ).toEqual({ ok: false, reason: "tidak_berwenang" });
  });
});
