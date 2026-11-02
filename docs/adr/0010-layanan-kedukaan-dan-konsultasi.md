# Layanan Kedukaan and Konsultasi Rencana Pemakaman: Operator-arranged funeral services, requested and quoted

New product type, outside the v1 spec. Owner request (dri, 2026-11-02), modelled on how funeral organisers in the market present their offer (we copy the structure, never another organiser's wording, prices or images). The site is organised in four groups:

1. **Jasa Pemakaman**: Pesan Sekarang (the existing Pemesanan Saat Duka) and **Konsultasi Rencana Pemakaman** (new).
2. **Layanan Kedukaan** (new): Rumah Duka, Mobil Jenazah, Jasa Cargo Jenazah, Jasa Repatriasi Jenazah, Peti Jenazah, Bunga Duka Cita.
3. **Program Wakaf Tanah Pemakaman** (the existing Pengajuan Wakaf).
4. **Daftar Lokasi** (the existing Lokasi Makam list).

Until now the platform sold only the grave (Hak Pakai, Biaya Pemakaman) and Layanan, which are grave services at a Petak Makam with photo proof. What a family needs between a death and the burial, or when moving the body between cities or countries, was not on offer, and a family planning ahead had no one to talk to before booking.

## Decision

- **A request, not a checkout.** A family asks for a Layanan Kedukaan, or for a Konsultasi Rencana Pemakaman, through a **Permintaan Kedukaan**: one short form per request, filed after a Kode Masuk like a Pengajuan Wakaf, with the contact, the city and the facts that service needs (pickup and destination for Mobil Jenazah, Cargo and Repatriasi; date and city for Rumah Duka, Peti and Bunga; a preferred time to be called for Konsultasi). Admin Platform contacts the family and arranges the service with its partners; the price is agreed in that contact. No online payment in this release: prices for cargo, repatriation and a funeral home depend on distance, route and venue, and the Operator has no contracted price list yet.
- **Arranged by the Operator.** The Operator, not a Lokasi Mitra, owns the request and its follow-up; it may pass the work to a Lokasi Mitra or another provider outside the platform. No new partner kind is onboarded.
- **In the Antrean, by urgency.** A Permintaan for Mobil Jenazah, Cargo, Repatriasi or Rumah Duka is urgent (a body is waiting): a Tier 1 row with a first-contact deadline of 30 minutes. Peti and Bunga are Tier 2 (2 hours). Konsultasi Rencana Pemakaman is Tier 3 (one working day, no alert).
- **A small lifecycle.** Diajukan → Dihubungi → Selesai, or Dibatalkan (by the family before contact, or by Admin Platform with a reason). The family follows it in Akun Saya and gets an email on each change, through Notifications.
- **Visuals.** The new pages use icons and plain cards, not photographs of headstones or cemetery grounds (owner feedback, 2026-11-02).

## Considered options

- **Tiered packages (Standar/Premium/VIP) sold by each Lokasi Mitra inside the Saat Duka checkout.** Drafted first, dropped when dri set the four-group menu: the owner wants single services the Operator arranges, including cargo and repatriation that no Lokasi Mitra provides.
- **Fixed prices paid online for Peti, Bunga and Mobil Jenazah in town.** Possible later, once real vendor prices exist; then those Layanan Kedukaan move to a Tagihan without changing the request form.
- **Information pages with only a WhatsApp button.** Leaves no record and no Antrean row; rejected.

## Consequences

- New domain module `kedukaan`, owning its tables, with Antrean row types and Notifications templates.
- `CONTEXT.md` gains Layanan Kedukaan, Permintaan Kedukaan and Konsultasi Rencana Pemakaman.
- The site header and footer follow the four groups (coordinated with the thread that refocuses the site on Lokasi Mitra and Graha Sentosa).
