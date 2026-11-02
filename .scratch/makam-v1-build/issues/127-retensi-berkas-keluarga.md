# Family files are deleted two years after the order is finished

Status: ready-for-agent
Blocked by: —
Spec: spec.md, Data and privacy decisions (retention: owner decision); go-live status G6

## What to build

The Kebijakan Privasi (`/kebijakan-privasi`, `src/lib/content-pages.ts`) tells families that KTP, Kartu Keluarga and akta kematian files are kept for two years after the order is finished, then deleted (owner decision 2026-10-29). Nothing deletes them today. Build the deletion so the page stays true.

- A scheduler tick (`scheduledTicks`, `tick(ctx, now)`, idempotent, deadlines from database state) per module that owns family files: today pemesanan, pengurusan, perpanjangan and wakaf hold uploaded KTP/KK/akta files (check each module's `berkas` code; billing, payouts and refunds hold documents the platform issues, not family files, and are out of scope).
- "Finished" is each module's own end state (CONTEXT.md terms); a file whose order is not finished is never deleted.
- Deleting removes the object from the private FileStore and leaves a record that the file existed and when it was deleted (audit), so staff see "berkas dihapus sesuai kebijakan" instead of a broken link.
- Two years is computed in Asia/Jakarta from the injected Clock.

## Acceptance criteria

- [ ] A KTP uploaded for an order finished two years and one day ago is gone from the FileStore after the tick; one finished one day short of two years is still there.
- [ ] Running the tick twice deletes nothing more and does not fail.
- [ ] Staff opening that order see that the file was deleted under the policy, not an error.
- [ ] An audit entry records each deletion.

## Comments

Opened 2026-11-02 from the privacy thread: the page promises deletion, no code does it yet. No order can reach two years before 2028-11, so this is not a launch blocker.
