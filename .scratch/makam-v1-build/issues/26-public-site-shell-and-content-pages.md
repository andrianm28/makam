# Public site shell, homepage and content pages

Status: ready-for-agent
Blocked by: 22, 63
Spec: Public site and routing decisions (Home, Content pages); stories 1, 2, 3, 4, 5, 6, 16

## What to build

The public site's frame and static content: the homepage with the headline "Urus Pemakaman dengan Tenang, dalam Satu Platform." (brand master message, spec amended 2026-09-26), the Saat Duka hero ("Keluarga baru saja wafat" first) and a separate "Siapkan makam untuk nanti" entry, the tile row (Perpanjang Makam, Layanan Makam, Urus di TPU DKI, Wakaf Tanah), the trust strip ("Lokasi terverifikasi · Harga transparan · Bantuan administrasi") linking to Cara Kami Bekerja, the top bar and the mobile menu drawer with the same items, the WhatsApp CS button on every page, the footer, and the content pages Tentang Kami, Cara Kami Bekerja, FAQ and Hubungi Kami.

## Acceptance criteria

- [ ] Top bar and drawer both list: Pesan Makam, Makam Keluarga, Layanan, Wakaf Tanah, Daftar Lokasi, Masuk / Akun Saya (depending on login).
- [ ] Perpanjang Makam and Layanan Makam tiles open the Makam keluarga hub with that action preselected (links resolve once ticket 34 lands; until then they point to the hub route); Urus di TPU DKI opens the Pengurusan di TPU DKI page (ticket 43); Wakaf Tanah opens the Wakaf page (ticket 58).
- [ ] "Siapkan makam untuk nanti" goes to the Terencana wizard (ticket 36) and is not part of the urgent flow.
- [ ] A WhatsApp CS button (a `wa.me` link to the CS number from Pengaturan Operator, ticket 63; a person answers in the WhatsApp Business app, no API) is on every public and Akun Saya page.
- [ ] Footer: "Makam.co.id dikelola oleh PT Jaya Korpora Prima". The legal name appears only in the footer and document headers; YIEM appears nowhere.
- [ ] Tentang Kami: what makam.co.id is; run by PT Jaya Korpora Prima; owns no land; works with partner cemeteries and DKI TPUs.
- [ ] Cara Kami Bekerja: three sections: what a Kunjungan Verifikasi checks and the publish gate; the price on the page equals the Tagihan, with the Biaya Layanan Platform always shown separately; the TPU permit is free, families may file it themselves, the Operator's fee is for convenience.
- [ ] FAQ: booking vs Hak Pakai; what is paid when; Pembatalan; Perpanjangan; TPU eligibility; documents; data use.
- [ ] Hubungi Kami: CS WhatsApp (`wa.me` link) and phone, and the Operator's address (from Pengaturan Operator, ticket 63).
- [ ] Mobile-first layout; pages render without login.
- [ ] Tests: a Playwright smoke test of the homepage hero order and the drawer items; a unit test that no rendered page contains "YIEM".

## Notes

Copy needs sign-off from the Operator (ticket 06); placeholders until then.

## Comments

- 2026-09-26 — Decided with the user (spec, "Home" and "imagery"): **prototype first** (after ticket 74 merges) covering the homepage, the Daftar Lokasi card, the Lokasi page and the two Saat Duka wizard screens (tickets 16, 22), desktop and phone, for the user to react to before these tickets are built. Homepage: Forest hero with Lora headline, tagline, Sand "Pesan makam sekarang" (Saat Duka) and the text link "Siapkan makam untuk nanti", beside a warm people photo; four photo tiles; trust strip Dibantu · Jelas · Aman with concrete lines; photographic like kamboja.co.id within the brand guardrails; licensed stock (source and licence recorded) until the Operator's photos exist; the "YIEM" test stays.
- 2026-09-26 — ADR 0004: the CS button and Hubungi Kami stay, as `wa.me` links only (no WhatsApp API). Content copy (FAQ, Tentang Kami) must not promise WhatsApp messages: families get email, and "Tidak punya email? Minta bantuan CS" is the fallback.
- 2026-09-26 — Release plan (user decision): in Rilis 1 the tiles Perpanjang Makam, Layanan Makam, Urus di TPU DKI and Wakaf Tanah (and their menu items) show "Segera hadir" with the CS link, and the trust strip's Dibantu line makes no claim about TPU paperwork (e.g. "Bantuan administrasi pemakaman").
- 2026-09-26 — Decided with the user from the public prototype (https://claude.ai/artifact/SYuh5fzc8TjkWQ5aoecYiF, branch worktree-agent-ab5e1eadecba063e3, commit 3607d88): keep the Unsplash hero until the Operator's shoot (brief: warm light, a three-generation family at home or at a well-kept Lokasi); keep the Rilis 1 "Segera hadir" tile row with its calm CS dialog; on phones the tiles are compact horizontal cards; Lora only on the Beranda and content pages. Build the Beranda from the prototype's layout.
- 2026-09-27 — **Orchestrator: both axes reviewed this branch (Standards + Spec), merge HELD.** Reports are recorded here *before* the fix pass starts, so the findings are fixed against a fixed point.

  **Standards — 1 HARD.** `pageExists` in `tests/support/page-exists.ts` returns `true` as soon as **any** segment of the route resolves to a `page.tsx`, and `src/app/staf/page.tsx` **exists** — so *every* `/staf/**` route returns `true` on its first segment, including routes that do not exist. Verified by running the function: `/staf/admin-platform/HALUS-PAGINA`, `/staf/x/y/z` and `/staf/admin-platform/tidak-ada` all answer `true`. The consequence is not a nit: `src/lib/staff-navigation.test.ts:98` ("every staff menu link opens a page that exists") can no longer fail for any staff link, so that coverage is gone silently — the opposite of the branch's claim that it was "fixed at their cause". The fix is small (accept `page.tsx` only at the **last** segment, and when a level holds a route group, **descend into it** rather than returning), and it must still handle a nested group like `(site)/(marketing)/x`.

  **Spec — 3 to close.**
  1. The AC asks for "a unit test that no rendered page contains 'YIEM'", but `no-retired-company-name.test.ts` only scans `src/app` and `src/components`, while this branch's public copy lives in `src/lib/content-pages.ts` and `src/lib/homepage-content.ts`. The guard is green without reading a single paragraph the branch wrote — the same shape as `no-ticket-numbers.test.ts`, which it should follow.
  2. AC 4 ("a CS button on every public and Akun Saya page") is not held for the forward link's target: `src/app/not-found.tsx` sits outside `(site)`, so a dead `/pesan-makam/terencana` link lands with no top bar, no footer and no CS button.
  3. Copy that contradicts the pages it points at: Cara Kami Bekerja says "urutan dan syaratnya kamiuraikan di halaman Pengurusan di TPU DKI" while that page itself says it has not been published; the FAQ's Perpanjangan answer points at the Makam Keluarga hub (ticket 34, Rilis 2). No promise may point at a page a family cannot reach.

  **Not blockers, recorded so they are not re-argued:** AC 2 stays open by owner decision (release plan, spec:656 — the tiles show "Segera hadir" with the CS link until 34/43/58 land), which the Spec axis confirmed is the right call; `prefetch: false` is a documented allowlist for routes awaiting their ticket, not a bug being hidden; `questionId`/`sectionId` duplication and a `slice(0,40)` React key are nits; the homepage tiles are icon+text cards where the spec says "large rounded photo cards" — follow-up, not a merge blocker.
- 2026-09-27 — **Orchestrator: the reviewer's HARD was nearly dismissed as wrong, and the orchestrator was the one who was wrong.** The code was misread twice before the function was actually executed. Recording it because the failure mode is the expensive one: an orchestrator that trusts its own reading over a reviewer's evidence will ship a silently-blind test. The rule that caught it is the rule to keep: *run the thing, do not read it.*
