import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isiKodeSekali, kodeDariSubjek, sumberJmap, sumberOutbox, type SumberKode } from "../../uat/support/pengisi-kode";

/*
 * The code filler stands where the owner stood: it watches $UAT_OUT/kode for the
 * runner's `<persona>.minta`, reads the newest Kode Masuk for that persona's email
 * from a mailbox (Stalwart over JMAP on the host, or the development stack's outbox)
 * and writes the six digits to `<persona>.txt`.
 */

const folders: string[] = [];
afterEach(() => {
  while (folders.length) rmSync(folders.pop()!, { recursive: true, force: true });
});

function folderKode() {
  const dir = path.join(mkdtempSync(path.join(tmpdir(), "uat-pengisi-")), "kode");
  folders.push(path.dirname(dir));
  mkdirSync(dir, { recursive: true });
  return dir;
}

function minta(dir: string, persona: string, sejak: string) {
  writeFileSync(path.join(dir, `${persona}.minta`), JSON.stringify({ persona, jenis: "kode-masuk", berkas: path.join(dir, `${persona}.txt`), sejak }));
}

const email = { pemesan: "pemesan@makam.co.id", "admin-platform": "admin-platform@makam.co.id" } as Record<string, string>;
const emailUntuk = (persona: string) => email[persona] ?? null;

describe("kodeDariSubjek", () => {
  it("reads the six digits of a Kode Masuk subject and nothing else", () => {
    expect(kodeDariSubjek("Kode Masuk Makam.co.id: 482913")).toBe("482913");
    expect(kodeDariSubjek("Kode verifikasi email Makam.co.id: 482913")).toBeNull();
    expect(kodeDariSubjek("Undangan Staf Makam.co.id: Admin Lokasi")).toBeNull();
  });
});

describe("isiKodeSekali", () => {
  it("writes the newest code for a waiting persona and leaves the others alone", async () => {
    const dir = folderKode();
    minta(dir, "pemesan", "2026-11-02T06:00:00.000Z");
    const ditanya: { email: string; sejak: Date }[] = [];
    const sumber: SumberKode = {
      kodeTerbaru: async (alamat, sejak) => {
        ditanya.push({ email: alamat, sejak });
        return "123456";
      },
    };
    const terisi = await isiKodeSekali({ dir, emailUntuk, sumber, dipakai: new Set() });
    expect(terisi).toEqual(["pemesan"]);
    expect(readFileSync(path.join(dir, "pemesan.txt"), "utf8").trim()).toBe("123456");
    expect(ditanya).toHaveLength(1);
    expect(ditanya[0]!.email).toBe("pemesan@makam.co.id");
    // A send can land a little before the runner stamps `sejak`; the window opens 90 s earlier.
    expect(ditanya[0]!.sejak.toISOString()).toBe("2026-11-02T05:58:30.000Z");
  });

  it("never writes a code it already gave, so a used code is not typed twice", async () => {
    const dir = folderKode();
    minta(dir, "pemesan", "2026-11-02T06:00:00.000Z");
    const dipakai = new Set<string>(["pemesan:123456"]);
    const sumber: SumberKode = { kodeTerbaru: async () => "123456" };
    expect(await isiKodeSekali({ dir, emailUntuk, sumber, dipakai })).toEqual([]);
    expect(existsSync(path.join(dir, "pemesan.txt"))).toBe(false);
  });

  it("waits while the mailbox has no code yet, and skips a persona without an email", async () => {
    const dir = folderKode();
    minta(dir, "pemesan", "2026-11-02T06:00:00.000Z");
    minta(dir, "mitra-jasa", "2026-11-02T06:00:00.000Z");
    const catatan: string[] = [];
    const sumber: SumberKode = { kodeTerbaru: async () => null };
    expect(await isiKodeSekali({ dir, emailUntuk, sumber, dipakai: new Set(), catat: (p) => catatan.push(p) })).toEqual([]);
    expect(existsSync(path.join(dir, "pemesan.txt"))).toBe(false);
    expect(catatan.join("\n")).toContain("mitra-jasa");
  });

  it("does not overwrite a code that is already waiting to be typed", async () => {
    const dir = folderKode();
    minta(dir, "pemesan", "2026-11-02T06:00:00.000Z");
    writeFileSync(path.join(dir, "pemesan.txt"), "654321\n");
    const sumber: SumberKode = { kodeTerbaru: async () => "123456" };
    expect(await isiKodeSekali({ dir, emailUntuk, sumber, dipakai: new Set() })).toEqual([]);
    expect(readFileSync(path.join(dir, "pemesan.txt"), "utf8").trim()).toBe("654321");
  });
});

type Panggilan = { url: string; init?: RequestInit };
function fetchPalsu(jawab: (url: string, init?: RequestInit) => unknown) {
  const panggilan: Panggilan[] = [];
  const fetch = (async (url: string | URL, init?: RequestInit) => {
    panggilan.push({ url: String(url), init });
    return new Response(JSON.stringify(jawab(String(url), init)), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof globalThis.fetch;
  return { fetch, panggilan };
}

describe("sumberOutbox (development stack)", () => {
  it("returns the code of the newest Kode Masuk email to the address", async () => {
    const { fetch, panggilan } = fetchPalsu(() => ({
      messages: [
        { subject: "Kode Masuk Makam.co.id: 111111", text: "", code: "111111" },
        { subject: "Kode verifikasi email Makam.co.id: 222222", text: "", code: "222222" },
        { subject: "Kode Masuk Makam.co.id: 333333", text: "", code: "333333" },
      ],
    }));
    const sumber = sumberOutbox({ baseUrl: "http://127.0.0.1:3310", fetch });
    expect(await sumber.kodeTerbaru("Pemesan@Makam.co.id", new Date(0))).toBe("333333");
    expect(panggilan[0]!.url).toBe("http://127.0.0.1:3310/api/dev/email-outbox?to=pemesan%40makam.co.id");
  });
});

describe("sumberJmap (Stalwart on the host)", () => {
  const sesi = {
    apiUrl: "https://mail.makam.co.id/jmap/",
    primaryAccounts: { "urn:ietf:params:jmap:mail": "akun-1" },
  };

  it("asks the persona's own account for Kode Masuk mail since the request and returns the newest", async () => {
    const { fetch, panggilan } = fetchPalsu((url) =>
      url.endsWith("/session")
        ? sesi
        : {
            methodResponses: [
              ["Email/query", { ids: ["m2", "m1"] }, "q"],
              [
                "Email/get",
                {
                  list: [
                    { id: "m2", subject: "Kode Masuk Makam.co.id: 777777", receivedAt: "2026-11-02T06:00:05Z" },
                    { id: "m1", subject: "Kode Masuk Makam.co.id: 666666", receivedAt: "2026-11-02T05:59:00Z" },
                  ],
                },
                "g",
              ],
            ],
          },
    );
    const sumber = sumberJmap({
      sesiUrl: "https://mail.makam.co.id/jmap/session",
      kredensial: { "pemesan@makam.co.id": { user: "pemesan", password: "rahasia" } },
      fetch,
    });
    expect(await sumber.kodeTerbaru("pemesan@makam.co.id", new Date("2026-11-02T05:58:30Z"))).toBe("777777");

    const auth = `Basic ${Buffer.from("pemesan:rahasia").toString("base64")}`;
    expect(new Headers(panggilan[0]!.init?.headers).get("authorization")).toBe(auth);
    const permintaan = JSON.parse(String(panggilan[1]!.init?.body));
    expect(panggilan[1]!.url).toBe("https://mail.makam.co.id/jmap/");
    expect(permintaan.methodCalls[0][1]).toMatchObject({ accountId: "akun-1", filter: { after: "2026-11-02T05:58:30.000Z" } });
  });

  it("refuses a persona whose credentials are not in the file, naming the address", async () => {
    const { fetch } = fetchPalsu(() => sesi);
    const sumber = sumberJmap({ sesiUrl: "https://mail.makam.co.id/jmap/session", kredensial: {}, fetch });
    await expect(sumber.kodeTerbaru("lapangan@makam.co.id", new Date())).rejects.toThrow("lapangan@makam.co.id");
  });
});
