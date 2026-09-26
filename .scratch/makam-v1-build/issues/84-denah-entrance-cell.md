# Pintu Masuk on the Denah

Status: ready-for-agent
Blocked by: 13, 36
Spec: Domain modules > Inventory (Denah); story 40; decided with the user 2026-09-26 (public prototype v2, question 7)

## What to build

Families picking a Petak on the Denah can't orient themselves: there is no entrance or direction. Let the Admin Lokasi mark one or more Denah cells as **Pintu Masuk** (a fourth cell type beside Petak Makam, Jalan and Bukan Petak), shown on the Terencana Denah picker and on the Admin Lokasi editor.

## Acceptance criteria

- [ ] A Pintu Masuk cell type in the Denah editor (single or bulk), never a Petak, never pickable; a used Petak can't become one.
- [ ] The Terencana Denah picker shows it with a clear icon and legend entry.
- [ ] CONTEXT.md gains the term (with Blok, Jalan, Bukan Petak).
- [ ] Tests at the inventory module seam; the change is audited like other Denah edits.
