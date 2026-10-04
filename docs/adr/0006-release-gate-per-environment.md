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

## Amendment (2026-10-04, owner decision)

Production switches at `RILIS_TERBUKA=1` and opens `3` after a UAT at level 3 is signed. This reverses the amendment of 2026-10-03, under which production opened all three releases on switch day. The mechanism is unchanged and the schedule is new: the owner chose to put the beta live on SumoPod's sandbox as soon as Rilis 1 and every payment case have passed on staging, with marked example data standing in for the real values (ADR 0007), and to take Rilis 2 and 3 through their own UAT at level 3 afterwards (the owner-approved plan of 2026-10-04, ticket 113: the switch within days, level 3 one to two weeks later).

- **The number is written down.** `prod.env` carries `RILIS_TERBUKA=1` explicitly. An unset value also means 1 on production, but a number nobody wrote cannot be checked: the preflight, run with `--rilis 1`, fails unless the env file says so and the running stack's `/api/health` reports the same `rilisTerbuka` (ticket 107).
- **Opening 3** is the host change of the runbook's "Which release is open", never a new image or promotion. It waits for the signed UAT at 3 and for the level-3 prerequisites of the go-live checklist (gates G4 and G5 of `.scratch/makam-v1-build/go-live-rilis-1.md`): tickets 111 and 112, Retribusi Pemda at Rp 0 as a real value, active Petugas Lapangan accounts and Bertugas devices, and the PT JKP name checked in the Surat Kuasa.
- **Ticket 84 stays ungated.** The Pintu Masuk cell, listed under Rilis 2 in the spec's Release plan, is a cell type of the Denah with no route, Server Action or tick of its own to close, so production at 1 shows it exactly as staging at 3 does. This amendment adds no gate for it.
- What the 2026-10-03 amendment made a prerequisite of the switch, ticket 06's reference data and a UAT at 3, is now a prerequisite of opening 3. Until the real values exist, the beta shows Data Contoh (ADR 0007).
