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
- [ ] A WhatsApp CS button (CS number from Pengaturan Operator, ticket 63) is on every public and Akun Saya page.
- [ ] Footer: "Makam.co.id dikelola oleh PT Jaya Korpora Prima". The legal name appears only in the footer and document headers; YIEM appears nowhere.
- [ ] Tentang Kami: what makam.co.id is; run by PT Jaya Korpora Prima; owns no land; works with partner cemeteries and DKI TPUs.
- [ ] Cara Kami Bekerja: three sections: what a Kunjungan Verifikasi checks and the publish gate; the price on the page equals the Tagihan, with the Biaya Layanan Platform always shown separately; the TPU permit is free, families may file it themselves, the Operator's fee is for convenience.
- [ ] FAQ: booking vs Hak Pakai; what is paid when; Pembatalan; Perpanjangan; TPU eligibility; documents; data use.
- [ ] Hubungi Kami: CS WhatsApp and the Operator's address (from Pengaturan Operator, ticket 63).
- [ ] Mobile-first layout; pages render without login.
- [ ] Tests: a Playwright smoke test of the homepage hero order and the drawer items; a unit test that no rendered page contains "YIEM".

## Notes

Copy needs sign-off from the Operator (ticket 06); placeholders until then.
