import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { KodeTidakDiberikan, bacaKode, mintaKode } from "../../uat/support/kode";

/*
 * The owner reads a Kode Masuk (or an authenticator code, for an Admin Platform)
 * out of their mailbox or phone; the orchestrator writes it to
 * $UAT_OUT/kode/<persona>.txt and the runner types it. Nothing else crosses
 * between the two: no mailbox access, no TOTP secret.
 */

const folders: string[] = [];
afterEach(() => {
  while (folders.length) rmSync(folders.pop()!, { recursive: true, force: true });
});

function folderKode() {
  const out = mkdtempSync(path.join(tmpdir(), "uat-kode-"));
  folders.push(out);
  const dir = path.join(out, "kode");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** A fake clock whose sleeping moves it, and lets a test act (as the orchestrator would) during a wait. */
function jam(saatTidur: (ke: number) => void = () => {}) {
  const keadaan = { sekarang: 0, tidur: 0 };
  return {
    keadaan,
    sekarang: () => keadaan.sekarang,
    tidur: async (ms: number) => {
      keadaan.sekarang += ms;
      keadaan.tidur += 1;
      saatTidur(keadaan.tidur);
    },
  };
}

describe("a code the owner reads out is six digits", () => {
  it.each([
    ["482913", "482913"],
    ["482913\n", "482913"],
    ["  482 913 \r\n", "482913"],
    ["482-913", "482913"],
  ])("reads %j as %j", (isi, kode) => {
    expect(bacaKode(isi)).toBe(kode);
  });

  it.each(["", "48291", "4829131", "kode: 482913", "48a913", "482913 482913"])("does not take %j for a code", (isi) => {
    expect(bacaKode(isi)).toBeNull();
  });
});

describe("the runner asks for the owner's code and types what arrives", () => {
  it("asks first, announces the request, then returns the code the orchestrator wrote and uses the file up", async () => {
    const dir = folderKode();
    const berkas = path.join(dir, "admin-lokasi.txt");
    const dipanggil: string[] = [];
    const waktu = jam((ke) => {
      if (ke === 2) writeFileSync(berkas, "482913\n");
    });

    const kode = await mintaKode({
      dir,
      persona: "admin-lokasi",
      jenis: "kode-masuk",
      timeoutMs: 10 * 60_000,
      ...waktu,
      kirim: async () => {
        dipanggil.push("kirim");
      },
      catat: (pesan) => dipanggil.push(pesan),
    });

    expect(kode).toBe("482913");
    expect(existsSync(berkas)).toBe(false);
    expect(dipanggil[0]).toBe("kirim");
    expect(dipanggil.join("\n")).toMatch(/admin-lokasi.*kode-masuk|kode-masuk.*admin-lokasi/i);
    expect(dipanggil.join("\n")).toContain(berkas);
  });

  it("never types a code left from an earlier request: the stale file is removed before the send", async () => {
    const dir = folderKode();
    const berkas = path.join(dir, "pemesan.txt");
    writeFileSync(berkas, "111111");
    const waktu = jam((ke) => {
      if (ke === 1) writeFileSync(berkas, "222222");
    });

    const kode = await mintaKode({
      dir,
      persona: "pemesan",
      jenis: "kode-masuk",
      timeoutMs: 60_000,
      ...waktu,
      kirim: async () => {
        expect(existsSync(berkas)).toBe(false);
      },
    });

    expect(kode).toBe("222222");
  });

  it("leaves a request marker while it waits, naming the kind of code, and takes it away once the code arrives", async () => {
    const dir = folderKode();
    const penanda = path.join(dir, "admin-platform.minta");
    let isiPenanda: { persona: string; jenis: string } | null = null;
    const waktu = jam((ke) => {
      if (ke === 1) {
        isiPenanda = JSON.parse(readFileSync(penanda, "utf8"));
        writeFileSync(path.join(dir, "admin-platform.txt"), "123456");
      }
    });

    await mintaKode({ dir, persona: "admin-platform", jenis: "totp", timeoutMs: 60_000, ...waktu, kirim: async () => {} });

    expect(isiPenanda).toMatchObject({ persona: "admin-platform", jenis: "totp" });
    expect(existsSync(penanda)).toBe(false);
  });

  it("waits through a file that is not a six-digit code, and says so, instead of typing it", async () => {
    const dir = folderKode();
    const berkas = path.join(dir, "pemesan.txt");
    const pesan: string[] = [];
    const waktu = jam((ke) => {
      if (ke === 1) writeFileSync(berkas, "belum ada");
      if (ke === 3) writeFileSync(berkas, "654321");
    });

    const kode = await mintaKode({
      dir,
      persona: "pemesan",
      jenis: "kode-masuk",
      timeoutMs: 60_000,
      ...waktu,
      kirim: async () => {},
      catat: (isi) => pesan.push(isi),
    });

    expect(kode).toBe("654321");
    expect(pesan.join("\n")).toMatch(/bukan 6 angka/i);
  });

  it("gives up when no code comes in time, naming the file to write", async () => {
    const dir = folderKode();
    const waktu = jam();

    const kesalahan = await mintaKode({
      dir,
      persona: "admin-lokasi",
      jenis: "kode-masuk",
      timeoutMs: 30_000,
      ...waktu,
      kirim: async () => {},
    }).then(
      () => null,
      (error: unknown) => error,
    );

    expect(kesalahan).toBeInstanceOf(KodeTidakDiberikan);
    expect((kesalahan as Error).message).toContain(path.join(dir, "admin-lokasi.txt"));
    expect(existsSync(path.join(dir, "admin-lokasi.minta"))).toBe(false);
  });
});
