# Harga Tampil: a Lokasi Mitra may keep its prices off the site's front

Owner decisions, 2026-11-02, relayed by dri. First: "tps yang boleh tampil harga didepan tetap di platform, tps yang tidak boleh tampil harga didepan akan diteruskan di whatsapp dan admin akan input manual ke platform". Then, the same day, the correction that replaces the WhatsApp ordering lane: "ralat semua transaksi tetap di platform, wa hanya cs konsultasi". On the card that followed, dri chose "Harga baru muncul di wizard". Builds on ADR 0012 (Lokasi Mitra only).

## Decision

- **A flag per Lokasi Mitra, `hargaTampil`, default on.** It lives with the other Lokasi Mitra flags (jsonb, Zod-parsed). A row written before the flag existed reads as on, so there is no migration and no data change. Admin Platform sets it on the Lokasi Mitra's Kebijakan form, audited like the other flags.
- **Every transaction stays on the platform.** Harga Tampil changes only where an amount is shown. It never changes whether a Lokasi Mitra can be ordered. The Saat Duka, Terencana, Layanan and Makamkan di sini flows treat a Lokasi Mitra the same way whether the flag is on or off.
- **When the flag is off,** no amount appears on the site's front. The Daftar Lokasi card says "Harga tampil saat memesan". The Lokasi page shows its Jenis Makam without prices, hides its Layanan price list, and keeps the "Pesan makam sekarang" button. The price appears in the order wizard before anything is sent, and again on the Tagihan.
- **WhatsApp is only the CS.** The Lokasi page offers "Konsultasi dengan CS" with a prefilled message naming the Lokasi Mitra. No order is taken or entered through WhatsApp, and there is no Admin Platform screen for entering an order on a family's behalf.

## Considered options

- **Order through WhatsApp, entered by Admin Platform.** This was the first decision, built and then withdrawn the same day: every transaction stays on the platform.
- **Show every price everywhere (no flag).** Rejected: some partners do not want their prices on the front of the site.
- **Hide such a Lokasi Mitra entirely.** Rejected: the partner still wants to be found.
