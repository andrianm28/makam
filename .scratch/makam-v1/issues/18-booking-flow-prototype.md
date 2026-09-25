# Booking flow prototype for a Lokasi Mitra

Type: prototype
Status: open
Blocked by: 06, 08, 09
Map: ../map.md

## Question

How should the Pemesan's journey look on a phone, from Cari Lokasi to Bukti Pemesanan, for both Pemesanan Saat Duka (choose a Jenis Makam; the Admin Lokasi assigns the plot) and Pemesanan Terencana (choose an exact Petak Makam or Kavling Keluarga with a 24 h hold)? Where do the Lokasi's tariff, the Biaya Layanan Platform and added Layanan appear so the price is transparent before checkout? A rough clickable prototype to react to.

Context from "Petak Makam lifecycle" (merged answer): the price shown splits into Harga Hak Pakai + Biaya Pemakaman; the Pemegang Hak defaults to the Pemesan but can be someone else; a released plot still holding a burial is offered only as tumpang, never as an empty plot; a burial under an existing Hak Pakai starts from a Nomor Makam or Nomor Kavling.

Context from "Layanan catalog and Paket Layanan model": Layanan come from one global list with fixed-price variants; a Saat Duka checkout offers only "bisa hari-H" Layanan; one Biaya Layanan Platform line per invoice covers the plot and any added Layanan; each added Layanan needs a target date respecting its lead time.
