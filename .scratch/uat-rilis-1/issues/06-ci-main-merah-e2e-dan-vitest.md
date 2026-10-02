# main CI went red twice on documentation-only commits

Status: in-progress
Blocked by: —
Spec: AGENTS.md (Tests: E2E runs in CI on every main build; a failing test is never "flaky")

## What to build

1. Run 36970973455 (commit 1184d18), job "E2E (Playwright against the pushed image)": `e2e/bukti-pemesanan.spec.ts:41` ("Saat Duka: a family orders, the Lokasi confirms and records the burial, the payment settles, and the Bukti Pemesanan is issued") failed on both attempts at line 141, `expect(page.getByText(/BPM\/\d{4}\/\d{6}/)).toBeVisible()` → strict mode violation, 2 elements: the `<p class="font-mono">BPM/2026/000001</p>` and Next's route announcer `<div role="alert" id="__next-route-announcer__">Bukti Pemesanan BPM/2026/000001 · Makam.co.id</div>`, which repeats the page title after a client-side `<Link>` navigation. Whether it fails depends on when the announcer is filled. The spec is unchanged since ticket 25: a latent defect in the spec, not in the app.
2. Run 36970410673 (commit ad692cd): the job "Lint, typecheck, Vitest" failed at "Run npm test"; the failing test is not yet named (the log tail had only expected Postgres errors).

## Acceptance criteria

- [ ] Every document-number assertion in `e2e/` matches the document body only (never the route announcer or the title), e.g. a `data-testid` on the number or a locator scoped to `main`.
- [ ] The failing Vitest test of run 36970410673 is named in `## Comments` with its error, and root-caused or linked to an existing ticket.

## Comments

- 2026-10-02 — Filed by the orchestrator from a read-only diagnosis of the two runs.
- 2026-10-02 — Two-axis review of item 1 (code-review skill, fixed point origin/main, branch fix/e2e-nomor-dokumen at c4e7f33). Standards: 0 hard; judgement — `saat-duka.spec.ts:73` (`/jatuh tempo … setelah pemakaman/`) is unanchored and unscoped, low risk. Spec: item 1 met — no document-number assertion in `e2e/` can still match the route announcer or a heading (142 scoped+anchored, 136 by testid, 80/96 anchored, 95 a link, `pembayaran.spec.ts:68` safe because the announcer carries the BPB number, not the TGH one); the document page has exactly one `<main>` (`src/app/dokumen/[link]/page.tsx:89–119`) and the announcer is appended to `<body>`. No fix pass. The spec could not be run here (the Docker build's `npm ci` fails in this container): proof is main CI's E2E job after the merge. Item 2: the Vitest failure is the same seed test as uat-rilis-1/05 (named in run 36970410673: `seed-contoh-publik-command.test.ts` "draws the prototype's own Denah …", `expected 1 to be +0`, 1 failed / 2581 passed); it is being root-caused under ticket 05.
