# Content: the TPU Layanan price list, Wakaf's Dirujuk status, and a kind-aware notice on filing-only IPTM orders

Status: ready-for-agent
Blocked by: none (found by the UAT runner audit and the reviews of ticket 116; group B; owner approved "ya keduanya", 2026-10-05)
Spec: tickets 43 (the TPU page and prices), 58 (Wakaf Tanah), 47 (Pengurusan IPTM); checklist R3-43.3 and the Wakaf items

## What to build

1. **`/pengurusan-tpu` says the TPU Layanan price list is not available yet.** `src/app/(site)/pengurusan-tpu/page.tsx` (about line 124) reads "Daftar harga Layanan di TPU DKI (perawatan makam, batu nisan, bunga) belum tersedia. Segera hadir.", although the DKI Layanan prices exist (Tarif, ticket 49, Data Contoh rilis3). Show the price list from the Tarif module's public reads. While the prices are Data Contoh, label them "harga contoh", as ticket 112 does.
2. **Wakaf outside Jabodetabek:** the confirmation page `/wakaf-tanah?nomor=…` (`src/app/(site)/wakaf-tanah/page.tsx`) shows only "Pengajuan wakaf diterima". It must show the Pengajuan's status, Dirujuk, with the pointer to KUA and BWI that ticket 58 specifies.
3. **A filing-only IPTM order shows a burial notice.** `src/app/pengurusan/[nomor]/pengajuan-pemesan.tsx` (about line 115) tells a family that buried on their own "…sejak pemakaman diatur dengan TPU". Make the notice kind-aware: for a filing-only order, speak of the filing, not of a burial we arranged. Do not change the refund rule behind it (money).

## Acceptance criteria

- [ ] **`/pengurusan-tpu`** lists the DKI Layanan with their prices (labelled "harga contoh" while Data Contoh is active). There is no "Segera hadir" for it.
- [ ] **Wakaf:** outside Jabodetabek, the confirmation shows Dirujuk and the KUA and BWI pointer. Inside, it is unchanged.
- [ ] **The filing-only notice** no longer mentions a burial. The Saat Duka TPU wording is unchanged.
- [ ] **Tests:** static renders with real reads; the copy is in Bahasa Indonesia and passes the copy guards.

## Comments

- 2026-10-05: Filed by the orchestrator after the switch (G3). Copy for the owner to glance at in the review.
