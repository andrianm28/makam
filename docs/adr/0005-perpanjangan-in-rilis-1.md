# Perpanjangan and the Makam keluarga hub ship in Rilis 1

Amends the spec's "Release plan", which placed the Makam keluarga hub and Perpanjangan in Rilis 2. Owner decision, 2026-10-01 (grilling).

Rilis 1 includes the **Makam keluarga hub (ticket 34)** and **Perpanjangan at a Lokasi Mitra, the OTP path (ticket 40)**, so the demo UAT of Rilis 1 covers the Perpanjangan journey end to end. Both tickets are already `resolved` and, in code, already reachable: the homepage tile **Perpanjang Makam** links to `/makam-keluarga?aksi=perpanjang`, and **Akun Saya → Makam** links to `/perpanjangan/[hakPakaiId]`. The spec's Release plan and the "Perpanjangan" FAQ still said the page was not there yet; this decision brings the record in line with the surface and opens it deliberately.

Kept out of Rilis 1: the **manual KTP / heir / claim path** (`berkas`), the **Hak Pakai expiry reminders and masa tenggang tick (ticket 42)**, burial under an existing Hak Pakai (35) and Pengembalian/Ganti Pemegang Hak/Calon Penghuni (39) stay Rilis 2; **TPU Perpanjangan (ticket 48)** stays Rilis 3. Nothing is dropped; the later releases keep the same spec.

## Consequences

- The spec "Release plan" lists 34 and 40 under Rilis 1 and removes them from Rilis 2; Rilis 2 keeps 35, 39, 41, 42; Rilis 3 keeps 43–48, 58.
- Only **Urus di TPU DKI** and **Wakaf Tanah** tiles/menu items still show "Segera hadir"; **Perpanjang Makam** and **Layanan Makam** are live (the latter was already live in code, Rilis 2 in the spec — its tile is unchanged by this decision).
- The "Perpanjangan" FAQ answer (which said the page did not exist) is corrected to describe the page.
- Accepted risk: the OTP path ships before the expiry reminders (ticket 42), so nothing reminds a Pemegang Hak that a Hak Pakai is near its end; the reminder tick arrives in Rilis 2.

- **Amended by ADR 0006 (2026-10-02):** Layanan Makam at a Lokasi Mitra (49–54) is Rilis 1; TPU Layanan and Mitra Jasa (55–57) are Rilis 3; a release number per environment now enforces the plan.
