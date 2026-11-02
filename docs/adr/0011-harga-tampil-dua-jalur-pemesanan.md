# Harga Tampil: two ways to order at a Lokasi Mitra

Owner decision, 2026-11-02 (relayed by dri: "tps yang boleh tampil harga didepan tetap di platform, tps yang tidak boleh tampil harga didepan akan diteruskan di whatsapp dan admin akan input manual ke platform"). Builds on ADR 0012 (Lokasi Mitra only).

## Decision

- **A flag per Lokasi Mitra, `hargaTampil`, default on.** It lives with the other Lokasi Mitra flags (jsonb, Zod-parsed); a row written before the flag existed reads as on, so no migration and no data change. Admin Platform sets it on the Lokasi Mitra's Kebijakan form, audited like the other flags.
- **On:** nothing changes; the Lokasi Mitra is listed with its prices and ordered self-serve (Saat Duka, Terencana).
- **Off:** the Lokasi Mitra stays in Daftar Lokasi and keeps its own page, but shows no price ("Harga lewat WhatsApp"), no Layanan prices and no order button; its call to action is the CS WhatsApp link with a prefilled message naming the Lokasi Mitra. The domain enforces it, not only the page: the Saat Duka and Terencana wizards neither list it nor place an order there (`lokasi_tidak_terbuka` / `lokasi_tidak_ada`), its Layanan offer is empty and a Layanan order or a Makamkan di sini request there is refused (`lokasi_tidak_terbuka`). Perpanjangan of a Hak Pakai already held there is unchanged: it is the holder's own renewal, not a new order.
- **The order still lands on the platform**, entered by Admin Platform on the family's behalf (spec: an order may be entered for a family without an Akun, audited). That screen is the next slice; until then the CS records it the way an offline order is recorded today.

## Considered options

- **Hide such a Lokasi Mitra entirely.** Rejected: the partner still wants to be found; only the price is private.
- **Show the page but leave the wizard open.** Rejected: the wizard would show the prices the partner refused to publish.
