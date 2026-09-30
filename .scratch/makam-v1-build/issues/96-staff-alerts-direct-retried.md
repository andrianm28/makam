# Staff alerts sent directly through `sendStaffAlert` are still one-shot

Status: ready-for-agent
Blocked by: —
Spec: spec.md, Notifications ("logs each message and retries it from the worker") and Work Queues (Peringatan Staf)

## What to build

Ticket 91 made the alerts queued by the Antrean tick (Tier 1 `baru`, `eskalasi_30`, `eskalasi_90`, and the TPU assignment alert) retry with the family messages' policy (4 sends in total, retried 15 min, 1 h and 4 h after each failure, then stop, no call row). Alerts sent directly through `sendStaffAlert` (Saat Duka baru, Hak Pakai, Bukti Pencairan and the other domain events that alert staff) are still sent once inside the request and lost on a failed send. Queue them the same way, in the transaction of the event that raises them, so the worker retries them with the same policy, per-alert transactions and per-channel skip; do not retry an alert whose subject no longer needs it where the owning module can say so through a callback.

## Acceptance criteria

- [ ] Every domain event that alerts staff directly is queued in its own transaction and sent by the worker; a failed send is retried with the ticket 91 policy and its log shows each attempt.
- [ ] A channel that succeeded is not resent; the bell entry is written once; the tick is idempotent.
- [ ] Alerts whose Antrean row or subject has closed are dropped (the `baru` and `eskalasi_90` kinds included, which ticket 91 leaves as sent) where the owning module supplies the answer through a callback.
- [ ] Tests through Notifications' public functions with the fake EmailSender and WebPush failing then succeeding.

## Comments

- 2026-09-30 — Filed at ticket 91's merge (owner decision 2026-09-30: staff alerts sent directly stay one-shot in 91).
