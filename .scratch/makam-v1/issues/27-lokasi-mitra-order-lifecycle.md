# Lokasi Mitra order lifecycle

Type: grilling
Status: resolved
Map: ../map.md

## Question

1. **Pemesanan Saat Duka statuses** at a Lokasi Mitra after "Diajukan → Dikonfirmasi": the full list the Pemesan and Admin Lokasi see (through Pemakaman recorded, Tagihan paid, Pencairan).
2. **Cancelling a Saat Duka order**: who may cancel, until when (before confirmation, before burial), and what happens to the Tagihan and any hari-H Layanan.
3. **When the Lokasi cannot serve**: a decline path for the Admin Lokasi (no suitable Petak, burial day impossible), and what the family is offered (another Lokasi Mitra, a DKI TPU via Pengurusan), mirroring what ticket 15 does at a TPU.
4. **Pemesanan Terencana confirmation**: the Admin Lokasi's deadline to confirm and the rejection path.
5. **Consent for a burial under an existing Hak Pakai** (tumpang or Kavling Keluarga): the booking prototype has no Pemegang Hak step. Is it an OTP to the Pemegang Hak's number, a signed statement, the Admin Lokasi's check, or implicit when the Pemegang Hak is the one logged in?
6. **Ditangguhkan / Berhenti exceptions**: read literally, "no new Pemesanan Makam" would refuse a burial in a family's already-paid Kavling Keluarga. Which actions stay allowed for existing Hak Pakai (burial under it, Perpanjangan, Layanan), and what happens to active Paket Layanan, open Pekerjaan Layanan and pending Pencairan when a Lokasi Mitra becomes Berhenti?

## Answer

Resolved by grilling with the user on 2026-09-25; every recommendation was accepted. Applies to orders at a **Lokasi Mitra**. `CONTEXT.md`: **Ditangguhkan** and **Berhenti** now say what still works and when Berhenti takes effect.

**1. Saat Duka statuses**

- The order status tracks **only the burial**: `Diajukan` → `Dikonfirmasi` → `Dimakamkan` → `Selesai`, plus side states `Ditolak` (see 3) and `Dibatalkan` (see 2).
  - `Dimakamkan` is set when the Admin Lokasi records the Pemakaman (date, Petak, layer). The recorded date starts the Tagihan clock of "Unpaid Saat Duka Tagihan at a Lokasi Mitra".
  - If no Pemakaman is recorded by the day after the planned burial date, the Admin Lokasi is prompted.
  - `Selesai` is set when the Tagihan is Lunas and the Bukti Pemesanan is issued.
- Payment is shown as a **separate badge** with the Tagihan's own status (Belum Lunas / Lewat Jatuh Tempo / Tidak Tertagih / Lunas).
- The Pemesan never sees Pencairan. The Admin Lokasi sees it as a separate column on its orders: Belum jatuh tempo / Jatuh tempo / Dicairkan (linking the Bukti Pencairan).
- A burial under an existing Hak Pakai follows the same track; confirming it creates no Hak Pakai.

**2. Cancelling a Saat Duka order**

- **Before `Dikonfirmasi`**: the Pemesan cancels self-serve; nothing has been billed.
- **After `Dikonfirmasi`, before `Dimakamkan`**: the Pemesan cancels self-serve with a required reason, and the Admin Lokasi is alerted at once.
  - The Tagihan is **cancelled**. If it was already paid, the tariff and Layanan items are refunded in full through Admin Platform, and the Biaya Layanan Platform is kept.
  - The Hak Pakai becomes `Dibatalkan` and the Petak goes back to `Tersedia`.
  - Hari-H Layanan are cancelled and refunded in full even inside H-1, unless one is already `Sedang Dikerjakan`.
  - The Lokasi charges **no cancellation fee** in v1.
- **After `Dimakamkan`**: no cancellation.
- The Admin Lokasi never cancels a confirmed order on its own initiative. When the family phones, it may record the cancellation on their behalf ("dibatalkan atas permintaan keluarga", audited).

**3. When the Lokasi cannot serve (Saat Duka)**

- Before confirming, the Admin Lokasi may:
  - **Tawarkan alternatif**: offer another Jenis Makam at the same Lokasi or another burial day. The Pemesan sees the new all-in total and accepts or declines with one tap; declining turns into a Tolak.
  - **Tolak**: decline, with a reason from a fixed list (Jenis Makam penuh / tanggal tidak bisa / tidak memenuhi syarat Lokasi / lainnya + note).
- On Tolak:
  - The order becomes `Ditolak`.
  - The Pemesan gets a WhatsApp link to a list, filtered to the same city, of other Lokasi Mitra × Jenis Makam with Tersedia units, plus DKI TPU Pengurusan. Their data carries over; resubmitting creates a new Nomor Pemesanan.
  - A **Tier 1** Antrean row **"Saat Duka ditolak"** asks Admin Platform to phone the family within 2 h and help them rebook.
- Declines are counted on the Lokasi like late confirmations and weigh on Ditangguhkan.

**4. Pemesanan Terencana confirmation**

- On submission (`Diajukan`), the chosen Petak / Kavling is **held**, so no one else can pick it.
- The Admin Lokasi confirms by the **end of the Lokasi's next working day**; there is no after-hours promise.
  - An unconfirmed order becomes a **Tier 3** Antrean row "Konfirmasi Terencana terlambat". There is no automatic cancellation.
- The Pemesan may withdraw at any time before paying, free.
- The same **Tawarkan alternatif** (another Petak / Kavling) / **Tolak** pair applies, with reasons such as "petak tidak sesuai di lapangan" or "tidak dijual". There is no call row.
- After confirmation, the 24 h payment hold from "Petak Makam lifecycle" runs.
- Statuses: `Diajukan` → `Dikonfirmasi` (hold running) → `Aktif` (paid, Hak Pakai created). Side states: `Ditolak`, `Kedaluwarsa` (hold lapsed unpaid → Petak `Tersedia`) and `Dibatalkan` (Pembatalan).

**5. Consent for a burial under an existing Hak Pakai** (tumpang, the next plot of a Kavling Keluarga, the Calon Penghuni's burial)

1. **Logged-in number = the Pemegang Hak's number on the Hak Pakai**: consent is implicit.
2. **Otherwise** the Pemegang Hak gets a WhatsApp message ("<Pemesan> meminta pemakaman <Almarhum> di makam Anda") and taps **Setujui** or **Tolak** after an OTP.
3. **No answer before the Admin Lokasi acts**: the Admin Lokasi may phone the Pemegang Hak and record **verbal consent** (who, when, note; audited).
4. **Pemegang Hak deceased (often the Almarhum) or unreachable**: the Admin Lokasi accepts heirship proof (KK showing the relationship, or a surat keterangan ahli waris). The proof may be brought on the burial day like other documents. The burial goes ahead, and a **Ganti Pemegang Hak** reminder is raised for the Admin Lokasi.
5. **The Pemegang Hak taps Tolak**: the order becomes `Ditolak` with reason "Pemegang Hak tidak menyetujui".

The tumpang policy checks from "Petak Makam lifecycle" still apply. An unpaid earlier Tagihan still shows its warning banner ("Unpaid Saat Duka Tagihan at a Lokasi Mitra").

**6. Ditangguhkan / Berhenti**

- **Ditangguhkan** blocks **only new Hak Pakai** (a Saat Duka new plot and Terencana). Everything else keeps working:
  - burials under an existing Hak Pakai;
  - Perpanjangan, Layanan and Paket Layanan cycles;
  - Pembatalan, Ganti Pemegang Hak and Pengembalian Hak Pakai;
  - orders already in progress, which the Admin Lokasi still handles.
- **Berhenti** has an **effective date** set by Admin Platform (default 30 days after the decision).
  - **Until that date** the Lokasi behaves as Ditangguhkan. Paket Layanan issue no further cycles, and the families are told.
  - **Open Pekerjaan Layanan** must be finished by the effective date. Any that are not are cancelled with a full refund **including** the Biaya Layanan Platform, since the family is not at fault.
  - **From the effective date** the platform takes no order of any kind for the Lokasi. Existing Hak Pakai stay read-only in Akun Saya with the pengelola's contact and "urus langsung dengan pengelola", covering later burials and Perpanjangan.
  - **Pending Pencairan** for finished work is paid out, net of anything the Lokasi owes back (refunds, Biaya Layanan Platform on direct payments). Held Terencana Pencairan follows "If the Lokasi Mitra partnership ends" in "Pemesanan Terencana contract terms".
