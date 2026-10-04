# UAT runner (ticket 110)

Playwright journeys for the staging UAT of Rilis 1, 2 and 3. Agents run them against `https://dev.makam.co.id` with an automated browser; the owner reads out the Kode Masuk and authenticator codes, spot-checks the screenshots and signs off. It is **not** the e2e suite: its own `uat/perjalanan` directory, never run by CI or by `npm run e2e`, and it **refuses any base URL other than staging or a local stack** (production is never a target; a browser request to a production host is aborted).

Checklists the journeys follow: `.scratch/makam-v1-build/uat-rilis-1-checklist.md` (sections 0 to 11) and `uat-rilis-2-3-checklist.md` (items tagged [BAYAR] / [TANPA-BAYAR]).

## Run

```
UAT_BASE_URL=https://dev.makam.co.id \
UAT_EMAIL_PEMESAN=owner+pemesan@gmail.com UAT_EMAIL_ADMIN_LOKASI=owner+lokasi@gmail.com \
UAT_EMAIL_ADMIN_PLATFORM=owner+platform@gmail.com \
UAT_OUT=/home/ubuntu/uat-runs/rilis-1 \
npm run uat                       # all journeys, in order
npm run uat -- --grep "§(2|3)\b"     # some sections (the \b keeps §1 from matching §10 and §11)
npm run uat -- --grep @bayar      # only the journeys that pay (must run on staging before the switch)
npm run uat -- --grep @tanpabayar # the 36 [TANPA-BAYAR] items of the Rilis 2/3 checklist: none pays, so they may run after the switch
```

Journeys are serial and hand state on through `$UAT_OUT/keadaan.json` (the Nomor Pemesanan, the Tagihan link), so run a later section with the same `UAT_OUT` as the earlier one. Order: `00` to `11`, then `rilis2-bayar`, `rilis2-tanpa-bayar`, `rilis3-bayar`, `rilis3-mitra-jasa-tanpa-bayar`, `rilis3-tpu-tanpa-bayar`, `rilis3-wakaf-tanpa-bayar` (file names in that alphabetical order; the Mitra Jasa journeys follow the job `rilis3-bayar` leaves). The Layanan journey (checklist section 11) is `10-layanan`, before the closing journey (section 10, `11-penutup`) that cancels the Terencana order it uses.

## Environment

| Variable | Meaning |
|---|---|
| `UAT_BASE_URL` | **required**: `https://dev.makam.co.id` or `http://127.0.0.1:<port>` / `localhost` |
| `UAT_BASIC_AUTH_USER`, `UAT_BASIC_AUTH_PASSWORD` | basic auth for a staging that has it (it has none today); both or neither; never committed |
| `UAT_EMAIL_PEMESAN`, `_ADMIN_LOKASI`, `_ADMIN_PLATFORM`, `_PETUGAS_LAPANGAN`, `_MITRA_JASA` | the personas: the owner's Gmail plus-aliases |
| `UAT_OUT` | this run's folder; default `/home/ubuntu/uat-runs/<WIB date>-<sha>` (`UAT_RUNS_DIR` changes the parent, `UAT_SHA` the sha) |
| `UAT_SESI_DIR` | saved sessions and the Kode Masuk request history; default `/home/ubuntu/uat-runs/sesi` |
| `UAT_KODE_TIMEOUT_MENIT` (15), `UAT_KODE_TUNGGU_MAKS_MENIT` (10) | how long to wait for a code; the longest the runner itself waits for the hour's limit |
| `UAT_LOKASI_TERENCANA`, `UAT_PETAK_TERENCANA`, `UAT_PETAK_TERENCANA_LAYANAN` (another free Petak, default A-02, for the Layanan at checkout walk), `UAT_LOKASI_SAAT_DUKA`, `UAT_JENIS_SAAT_DUKA`, `UAT_TELEPON`, `UAT_TPU` | staging data (defaults in `support/halaman.ts`) |
| `UAT_LOKASI_DI_ATAS_BATAS`, `UAT_LOKASI_BERHENTI`, `UAT_HAK_PAKAI_TUMPANG`, `_TANPA_EMAIL`, `_MASA_TENGGANG`, `_BERHENTI`, `UAT_LAYANAN_BERHENTI` | optional data for the Rilis 2 and edge cases; a journey without its data is skipped and says so |
| `UAT_HAK_PAKAI_PERPANJANGAN` | §5 of Rilis 1: id of a fixed-term Hak Pakai of the Pemesan persona (Pemegang Hak email = `UAT_EMAIL_PEMESAN`) whose Perpanjangan is open today: end date at most 3 months away, or past it inside the Masa Tenggang. A Hak Pakai just made by §4 (10 years) says `bisa diperpanjang mulai <tanggal>` and offers no term. The journey **uses the record up** (the end date moves out by a term), so each run needs a fresh one; skipped, with the reason, without it |
| `UAT_HAK_PAKAI_PEMEGANG_LAIN`, `_TUMPANG_DIBLOKIR`, `_KEMBALI`, `_GANTI`, `_PERBAIKAN`, `_AHLI_WARIS`, `_KLAIM`, `_PERBAIKAN_BERKAS`, `_AKHIRI`, `UAT_PETAK_DILEPAS` | the records the Rilis 2 [TANPA-BAYAR] journeys act on (checklist P8, e to j); several **use the record up** (return, change of Pemegang Hak, ending), so each needs a fresh one per run; a journey without its record is skipped and says which variable to set |

## The owner's codes

When a journey needs a code the runner presses the send button and then waits, printing `[UAT] MENUNGGU kode-masuk untuk persona <nama>: tulis 6 angka ke <UAT_OUT>/kode/<nama>.txt` and leaving `<nama>.minta` (JSON: who, which kind). Whoever drives the run writes the six digits (the Kode Masuk from the mailbox, or the authenticator code for an Admin Platform) to that `.txt` file; the runner types them and deletes the file. A leftover file is removed before the send, so an old code is never typed.

## Refusals before any journey

The base URL is checked twice, and either check stops the run with a message that starts `UAT ditolak`:

1. **By its words** (`bacaKonfigurasi`, `support/lingkungan.ts`): only exactly `https://dev.makam.co.id`, or `localhost` / `127.0.0.1` / `[::1]` on any port. Production and look-alike hosts are refused, and a browser request to any other makam.co.id host is aborted during the run.
2. **By asking the stack** (`support/pra-uji.ts`, Playwright's `globalSetup`, once before any journey): the runner calls `GET <base URL>/api/health` and reads `environment`, the `APP_ENV` of that process. Only `development`, `test` or `staging` pass. This is the check that stops a loopback port of the production host from passing as a local stack: production listens on `127.0.0.1:3100`, passes check 1 and answers `production`, so the run exits 1 with "mengaku environment produksi". The check fails closed: no answer (nothing listening, a timeout), an answer that is not the health report, no `environment` in it, or an environment the runner does not know ("tidak dikenal") are all refused. A 503 from a known environment (the worker's heartbeat is stale) still passes, because the check settles where the stack is, not whether it is well. Staging's basic auth, when set, is sent with the request.

So a local stack (`UAT_BASE_URL=http://127.0.0.1:3310`) runs only when its own `APP_ENV` is `development` or `test`. Nothing is sent to the stack, not even a login, before both checks pass.

## Limits

The server allows one emailed code per IP every 60 s and five in any rolling hour (`src/domain/identity/otp.ts`). The runner keeps inside both (`support/jeda-kode.ts`, history in `$UAT_SESI_DIR/riwayat-kode.json`): it waits out the 60 s itself and refuses, saying when it may try again, rather than wait more than `UAT_KODE_TUNGGU_MAKS_MENIT`. Each persona's session is saved (an Admin Platform's lasts 12 hours), so a persona asks for a code only when it has no working session.

## Output (not committed)

`$UAT_OUT/laporan-<WIB date and time>/index.html` (Playwright HTML report, one folder per invocation), `ringkasan.md` and `ringkasan.json` (results, failures, the steps a person must check), `bukti/<journey>/NN-<step>.png` (a screenshot at every step), `artefak/` (traces of failures).

## The tags, and what keeps them honest

`@bayar` is every journey that pays (QRIS in the sandbox), so `--grep @bayar` is what has to run on staging before the switch; `@tanpabayar` is the 36 [TANPA-BAYAR] items, which never pay. Which helper pays is read from the helpers' own text (the one that presses "Simulate Payment" and every helper built on it), never from a list of names: `tests/uat/pembayar.test.ts` fails a journey that pays without `@bayar` or one marked `@tanpabayar` that pays. `tests/uat/checklist-perjalanan.test.ts` fails when a [BAYAR] or [TANPA-BAYAR] item of the checklists has no journey that runs (its title carries the item's id), and `tests/uat/kata-di-sumber.test.ts` fails when a button, label, heading or test id a journey looks for is no longer in the app's source: no journey has met a stack yet, and this is the check they get meanwhile.

## What it cannot do

It has no mailbox, no phone and no SumoPod dashboard. Steps that need them are declared with `manual(...)` and listed under "Perlu dicek manusia" in the summary. The sandbox checkout is SumoPod's own page: if its words change, fix `support/bayar.ts` (QRIS, "Simulate Payment").
