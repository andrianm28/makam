import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BatasKodeTercapai, JedaKodeMasuk, putuskanKirimKode } from "../../uat/support/jeda-kode";

/*
 * The server lets one IP ask for an emailed Kode Masuk once every 60 s and five
 * times in any rolling hour (src/domain/identity/otp.ts: OTP_RESEND_AFTER_MS,
 * OTP_MAX_SENDS_PER_WINDOW). The UAT runner keeps inside both before it ever
 * presses "Kirim Kode Masuk", because a refused request costs the owner a wait
 * and a code read out for nothing.
 */

const DETIK = 1_000;
const MENIT = 60 * DETIK;
const JAM = 60 * MENIT;

const folders: string[] = [];
afterEach(() => {
  while (folders.length) rmSync(folders.pop()!, { recursive: true, force: true });
});

/** A runner on a fake clock whose sleeping moves the clock, with its history kept in a file. */
function pelari(opsi: { berkas?: string; mulai?: number; maksTungguMs?: number; margin?: number } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "uat-jeda-"));
  folders.push(dir);
  const berkas = opsi.berkas ?? path.join(dir, "riwayat-kode.json");
  const jam = { sekarang: opsi.mulai ?? 10 * JAM };
  const catatan: string[] = [];
  const jeda = new JedaKodeMasuk({
    berkas,
    sekarang: () => jam.sekarang,
    tidur: async (ms) => {
      jam.sekarang += ms;
    },
    catat: (pesan) => catatan.push(pesan),
    margin: opsi.margin ?? 0,
    maksTungguMs: opsi.maksTungguMs,
  });
  return { jeda, jam, berkas, catatan };
}

describe("the UAT runner waits 60 s between two Kode Masuk requests", () => {
  it("lets the first request go at once", async () => {
    const { jeda, jam } = pelari();
    const mulai = jam.sekarang;
    await jeda.sebelumMintaKode();
    expect(jam.sekarang - mulai).toBe(0);
  });

  it("holds the second request until 60 s after the first", async () => {
    const { jeda, jam } = pelari();
    await jeda.sebelumMintaKode();
    const pertama = jam.sekarang;
    jam.sekarang += 20 * DETIK; // the owner takes 20 s to read the first code out
    await jeda.sebelumMintaKode();
    expect(jam.sekarang - pertama).toBe(60 * DETIK);
  });

  it("does not wait again when the owner took longer than a minute", async () => {
    const { jeda, jam } = pelari();
    await jeda.sebelumMintaKode();
    jam.sekarang += 5 * MENIT;
    const sebelum = jam.sekarang;
    await jeda.sebelumMintaKode();
    expect(jam.sekarang).toBe(sebelum);
  });

  it("keeps a safety margin over the server's 60 s by default, for a clock that runs a little apart", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "uat-jeda-"));
    folders.push(dir);
    const jam = { sekarang: 0 };
    const jeda = new JedaKodeMasuk({
      berkas: path.join(dir, "r.json"),
      sekarang: () => jam.sekarang,
      tidur: async (ms) => {
        jam.sekarang += ms;
      },
    });
    await jeda.sebelumMintaKode();
    await jeda.sebelumMintaKode();
    expect(jam.sekarang).toBeGreaterThan(60 * DETIK);
  });

  it("says why it waits, so the person watching the run knows it has not hung", async () => {
    const { jeda, catatan } = pelari();
    await jeda.sebelumMintaKode();
    await jeda.sebelumMintaKode();
    expect(catatan.join("\n")).toMatch(/menunggu 60 detik/i);
  });
});

describe("the UAT runner asks for at most five Kode Masuk in a rolling hour", () => {
  async function limaPermintaan(opsi: Parameters<typeof pelari>[0] = {}) {
    const satu = pelari(opsi);
    for (let ke = 0; ke < 5; ke += 1) await satu.jeda.sebelumMintaKode();
    return satu;
  }

  it("refuses a sixth request and says when it may try again: the hour after the oldest request that keeps the hour full", async () => {
    const { jeda, jam } = await limaPermintaan({ mulai: 10 * JAM });
    // Five requests, 60 s apart: at 10:00, 10:01, 10:02, 10:03, 10:04.
    const pertama = 10 * JAM;
    jam.sekarang += 30 * DETIK;
    const kesalahan = await jeda.sebelumMintaKode().then(
      () => null,
      (error: unknown) => error,
    );
    expect(kesalahan).toBeInstanceOf(BatasKodeTercapai);
    expect((kesalahan as BatasKodeTercapai).bolehLagi.getTime()).toBe(pertama + JAM);
    expect((kesalahan as BatasKodeTercapai).message).toMatch(/5 .*per jam/);
  });

  it("waits the hour out when the owner allows a long wait, and then goes ahead", async () => {
    const { jeda, jam } = await limaPermintaan({ mulai: 10 * JAM, maksTungguMs: 2 * JAM });
    await jeda.sebelumMintaKode();
    expect(jam.sekarang).toBe(11 * JAM);
  });

  it("counts only the last 60 minutes: requests older than that no longer fill the hour", async () => {
    const { jeda, jam } = await limaPermintaan({ mulai: 10 * JAM });
    jam.sekarang = 11 * JAM + 10 * MENIT; // all five are more than an hour old
    const sebelum = jam.sekarang;
    await jeda.sebelumMintaKode();
    expect(jam.sekarang).toBe(sebelum);
  });

  it("frees one place at a time as the oldest request leaves the hour", async () => {
    const { jeda, jam } = await limaPermintaan({ mulai: 10 * JAM, maksTungguMs: 2 * JAM });
    jam.sekarang = 11 * JAM + 30 * DETIK; // the 10:00 request left the hour, the 10:01 one has not
    await jeda.sebelumMintaKode(); // the hour holds four, so this one goes at once (11:00:30)
    expect(jam.sekarang).toBe(11 * JAM + 30 * DETIK);
    await jeda.sebelumMintaKode(); // the 10:01 request leaves at 11:01:00, but the 60 s gap runs to 11:01:30
    expect(jam.sekarang).toBe(11 * JAM + 90 * DETIK);
  });
});

describe("the UAT runner remembers its Kode Masuk requests between runs", () => {
  it("keeps the 60 s gap and the hour's count across two runner processes sharing one history file", async () => {
    const pertama = pelari({ mulai: 10 * JAM });
    await pertama.jeda.sebelumMintaKode();

    const kedua = pelari({ berkas: pertama.berkas, mulai: 10 * JAM + 10 * DETIK });
    await kedua.jeda.sebelumMintaKode();
    expect(kedua.jam.sekarang).toBe(10 * JAM + 60 * DETIK);
  });

  it("starts fresh, rather than failing the run, when the history file is unreadable", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "uat-jeda-"));
    folders.push(dir);
    const berkas = path.join(dir, "riwayat-kode.json");
    writeFileSync(berkas, "bukan json");
    const { jeda, jam } = pelari({ berkas });
    const mulai = jam.sekarang;
    await jeda.sebelumMintaKode();
    expect(jam.sekarang).toBe(mulai);
    expect(JSON.parse(readFileSync(berkas, "utf8"))).toEqual([mulai]);
  });
});

describe("the decision itself", () => {
  it("is to go ahead with no earlier request, to wait for the 60 s gap, and to refuse a full hour", () => {
    expect(putuskanKirimKode([], 1_000_000)).toEqual({ jenis: "boleh" });
    expect(putuskanKirimKode([1_000_000], 1_000_000 + 10 * DETIK, { margin: 0 })).toEqual({ jenis: "tunggu", ms: 50 * DETIK });
    const lima = [0, 1, 2, 3, 4].map((menit) => menit * MENIT);
    expect(putuskanKirimKode(lima, 5 * MENIT, { margin: 0 })).toEqual({ jenis: "tolak", bolehLagi: new Date(JAM) });
  });
});
