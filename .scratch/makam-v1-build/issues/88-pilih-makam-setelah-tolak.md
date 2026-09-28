# Pilih makam setelah sebuah Tolak: banner, Lokasi yang menolak, dan pemesanan ulang

Status: ready-for-agent
Blocked by: 24
Spec: spec.md, Public site — "After a Tolak, the Pilih makam list opens with a banner, the rejecting Lokasi removed and the family's data prefilled"

## What to build

The Tolak and cancellation of ticket 24 are on `main`, and the domain half is already there: `pemesanan.rebook(nomor, pemesan)` answers whether a declined order is that family's to rebook, and the alternatives of ticket 24 exist. **What is not on `main` is the screen that uses them.** Ticket 44 landed the TPU section and the type chip on "Pilih makam", and its shape of `layarPilihMakam` is incompatible with the one ticket 24 wrote: 44 returns `{ grup, tpu, semuaKota, kota, asal, jenis }` and calls `pengurusan.pilihanSaatDukaTpu`; 24's version returns `{ grup, semuaKota, kota, asal, pemesanUlang }` and calls neither. Reconciling two features inside a merge worktree would have meant the orchestrator answering three product questions that neither ticket asks, so the interaction was deferred here and the merge took ticket 44's shape.

Build the screen on top of **both**, with `rebook` as a caller rather than as dead code.

The three questions neither ticket answers, which this ticket owns:

- **Does the TPU section survive a Tolak?** A family whose order was declined at one cemetery is choosing again, and the TPU section is a real alternative.
- **Is the rejecting Lokasi excluded from the TPUs too?** Ticket 24 excludes it from the Lokasi Mitra query. A TPU is not that Lokasi, so nothing in the code says either way.
- **Does the type chip still apply when a `dari` link is followed?** The chip is a plain URL filter that changes no data. A link with a banner, a chip, and a `dari` is three pieces of state on one screen, and what happens when they disagree is a decision, not an implementation detail.

## Acceptance criteria

- [ ] `layarPilihMakam` returns the TPU section and the type chip **and** the Tolak banner, with all three coming from one read and one city filter, so the highlighted chip and every card agree.
- [ ] The banner names the Lokasi that refused, in the words `CONTEXT.md` uses, and offers the path to rebook.
- [ ] The Lokasi that refused does not appear in the list **in the query, not in the view** — a screen that forgets to hide it must not exist.
- [ ] The family's own data is prefilled for the new attempt, and a `dari` naming no declined order of that family gives no banner and no error page.
- [ ] The three questions above are each answered in the ticket's `## Comments` **before** the code that depends on them, with the reasoning, so a later reader can tell a decision from an accident.
- [ ] Every label is a `CONTEXT.md` term. There is deliberately **no** entry for "Konfirmasi TPU Saat Duka" and none should be added: it is a compound of existing words.
- [ ] Tests in the ticket's own glossary words, each failing before it is written, covering a Tolak followed with a TPU section, a Tolak with the chip, and a `dari` that names nothing.

## Notes

- **Do not rebook by rewriting the order.** Ticket 24 decides a cancellation records a refund request in the same commit (owner, 2026-09-28); a rebook is a **new** order, and the old one keeps its history. `pemesanan.rebook` already answers this and must not grow a "reuse the old order" path.
- **`tagihan_line` and `bukti_pembayaran` are append-only**, and the first attempt at this screen must not invent a line-level correction to undo a declined attempt.
- `pageExists` accepts only a `page.tsx` on the **last** segment, and a route group is invisible in a URL, so two `page.tsx` for one route type-checks and passes every test. Only `npm run build` sees it.
