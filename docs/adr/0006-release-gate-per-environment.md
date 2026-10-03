# One release number per environment decides what is open

`main` holds work from all three releases, and one image runs on staging and production, so the release plan can only hold on production if the running app itself knows which release is open. Owner decision, 2026-10-02 (grilling rounds 3 and 4, UAT ticket 07): each environment carries one **release number** (`RILIS_TERBUKA`: production `1`, staging `3`), and every feature belongs to the release that opens it. A feature above the number is closed everywhere it can be reached: its routes, menu items, homepage tiles, Akun Saya tabs, staff menu items, Server Actions and scheduled ticks. Opening Rilis 2 or 3 later is a change of that number on the host, not a new image or promotion.

## Considered options

- **Promote everything `main` holds** (widen Rilis 1). Rejected: Rilis 2/3 has not been through UAT, and ticket 42's reminder tick would email real families the day old-app Hak Pakai rows arrive.
- **One switch per feature.** Rejected: many combinations to test; the release plan already groups features, so one number matches how the owner opens them.
- **Hide links only ("Segera hadir").** That is what existed, and it is not a gate: every URL of a closed feature still worked.

## Consequences

- A closed feature's **public and Akun Saya pages** show a "Segera hadir" page (a family may hold an old link); its **staff pages and Server Actions** answer 404, so a closed feature cannot be used at all. Its **ticks do not run**. Tiles and menu items keep their "Segera hadir" state.
- **Layanan Makam at a Lokasi Mitra moves into Rilis 1** (catalog and Paket definitions 49, order and Admin Lokasi fulfilment 50, Keluhan and Penilaian 51, the message thread 52, Layanan at checkout 53 for a Lokasi Mitra, Paket Layanan cycles 54): its tile was already live (ADR 0005) and the owner's UAT covers it. **TPU Layanan and Mitra Jasa stay Rilis 3** (55, 56, 57, and the TPU parts of 51–53).
- The release a closed feature waits for is the spec's Release plan, which this ADR amends for Layanan; ADR 0005's Rilis 1 additions (34, 40) stand.
- The number is a deployment setting validated with Zod in `src/lib/env.ts`; staging opens everything so every release can be tested before it opens on production.

## Amendment (2026-10-03, owner decision)

Production opens `RILIS_TERBUKA=3` at the go-live instead of `1`: the owner chose to open all three releases on switch day. The premise that Rilis 2 waits for "old-app Hak Pakai rows" is void: the old app holds test data only and no Hak Pakai (ticket 65), and existing Hak Pakai arrive through Denah clearing. What this moves before the switch: ticket 06's reference data loaded and a UAT with staging at 3. The mechanism is unchanged: one image, one number per environment.
