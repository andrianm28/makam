# Pengaturan Operator (Operator settings)

Status: ready-for-agent
Blocked by: 09
Spec: Domain modules > 17. Pengaturan Operator; 1. Identity & Access (first Admin Platform is the only seed); Billing > Documents (header); Public site > Content pages (Hubungi Kami); 15. Notifications (inbound auto-reply); stories 5, 72, 183, 188

## What to build

One Admin Platform–only "Pengaturan Operator" screen for the reference values that no other screen owns: the Operator's legal name, registered address and contact (phone, email), and the CS WhatsApp number with its reply hours (e.g. "dibalas mulai pukul 06:00"). Expose a small read function the other modules call instead of env config: document headers (ticket 18), the CS button and Hubungi Kami (ticket 26), the inbound auto-reply (tickets 20, 62), the OTP no-fallback pointer (ticket 67; was ticket 60 before 2026-09-25) and the night TPU submission text (ticket 44). The other reference values stay on their owning screens: Biaya Layanan Platform (ticket 12), DKI Biaya Pengurusan and the DKI TPU list (ticket 43), DKI Layanan prices and Mitra Jasa rates (ticket 49), the Nazhir list (ticket 58), the holiday list (ticket 11). Content page copy stays in code.

## Acceptance criteria

- [ ] Only Admin Platform can read the edit screen and write these values (authorisation check); every change is audited with before/after.
- [ ] Nothing here is seeded; the values are entered in the dashboard before launch (ticket 06). Test fixtures may set them.
- [ ] Consumers read the values through the module's public function, never from env or constants.
- [ ] Values are kept per change with its time, so ticket 18 can make an issued Tagihan or Bukti keep the header values in force when it was issued.
- [ ] The CS WhatsApp number is validated and normalised like account numbers (ticket 08).
- [ ] Tests: only Admin Platform can write; each write is audited; the read function returns the current values and the values in force at a given instant.
