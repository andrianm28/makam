# Admin Platform Tagihan detail always 404s

Status: ready-for-agent
Blocked by: —
Spec: spec.md, Billing > Payment (ticket 30)

## What to build

The Admin Platform Tagihan detail page (`/staf/admin-platform/tagihan/[tagihanId]`) always shows "Halaman tidak ditemukan", so Admin Platform cannot open a Tagihan to record a manual payment, set a Harga Khusus or reverse a direct payment (ticket 30). The search list on `/staf/admin-platform/tagihan` returns correct rows (e.g. `TGH/2026/000001` with a "Buka" link), but every "Buka" lands on the not-found page.

Root cause (found by reading the page and reproducing with network logging on `dev.makam.co.id`): `src/app/staf/admin-platform/tagihan/[tagihanId]/page.tsx` defines `const paramsSchema = z.uuid();` and then calls `paramsSchema.safeParse(await params)`. `await params` is the object `{ tagihanId }`, not the id string, so `z.uuid()` always fails and `notFound()` runs. `generateMetadata` in the same file is correct (`const { tagihanId } = await params;`).

## Acceptance criteria

- [ ] Opening a Tagihan from the search list (by Nomor Tagihan or Nomor Pemesanan) renders the detail page, not the not-found page.
- [ ] A regression test fails before the fix and passes after (a Playwright smoke that opens the Tagihan detail for a seeded/known Tagihan, or an equivalent page-level test through the public surface).
- [ ] An unknown/invalid id still shows the not-found page.

## Comments

- 2026-10-01 — Filed from the Rilis 1 UAT. The owner expected history/active Tagihan on the page; instead the search returned `TGH` rows whose detail 404'd. Root cause confirmed by reading the page and by reproducing (HTTP 200 RSC, rendered not-found, for `499e7be5-85e0-48aa-826c-191077beb2ef`).
