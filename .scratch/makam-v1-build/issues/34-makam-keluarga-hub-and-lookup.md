# Makam keluarga hub and grave lookup

Status: ready-for-agent
Blocked by: 14, 26
Spec: Domain modules > 5. Inventory (lookup); Public site > Makam keluarga hub; stories 50, 51

## What to build

The Makam keluarga hub asks "Di mana makamnya?" (Lokasi Mitra / TPU DKI) and owns the branch for tumpang, Perpanjang, Layanan and Pengurusan IPTM; the Perpanjang Makam and Layanan Makam tiles open it with that action preselected; logged-in users see shortcuts to their Makam tab. For Lokasi Mitra, the Inventory lookup finds a grave by Lokasi + Nomor Makam / Nomor Kavling, or Almarhum name + year of death, returning only Almarhum names, numbers, status and end date, never the Pemegang Hak's details. A Kavling Keluarga returns the whole kavling. The TPU branch links to the TPU flows (tickets 44, 47, 48, 56).

## Acceptance criteria

- [ ] Lookup by Lokasi + Nomor Makam, Lokasi + Nomor Kavling, or Lokasi + Almarhum name + year of death.
- [ ] Results expose only Almarhum names, Nomor Makam / Kavling, Hak Pakai status and end date; no Pemegang Hak name or number anywhere in the response payload.
- [ ] A match inside a Kavling Keluarga returns the whole kavling (all its Petak).
- [ ] From a result the hub offers the preselected action (Makamkan di sini, Perpanjang, Layanan), each built by later tickets; heirs of a deceased Pemegang Hak start here.
- [ ] Lookup is rate-limited to prevent enumeration.
- [ ] Logged-in users see their Makam tab graves as shortcuts.
- [ ] Tests: each lookup form; privacy of the payload; kavling returned whole; Almarhum name matching tolerant of case and spacing.
