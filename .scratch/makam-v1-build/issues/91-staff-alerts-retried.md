# Staff alerts are sent once and never retried

Status: ready-for-agent
Blocked by: —
Spec: spec.md, Notifications ("logs each message and retries it from the worker") and Work Queues (Tier 1 alerts)

## What to build

A Peringatan Staf (push + email to staff: Tier 1 alerts and their escalation from ticket 28, the Mitra Jasa assignment alert from ticket 56) is queued inside the transaction that raises it and sent by the worker tick, but a failed send is not retried: the alert is marked sent once and a push or email that failed is simply lost. The family's messages are retried; staff alerts should be too, so that a Tier 1 row or a Mitra Jasa's new job is never missed because one send failed.

## Acceptance criteria

- [x] A staff alert whose push and email both fail is tried again by the worker, with a bounded number of attempts, and its log shows each attempt.
- [x] A staff alert that succeeds on one channel is not sent again on that channel.
- [x] Retrying is idempotent: running the tick twice sends nothing twice.
- [x] Tests through Notifications' public functions with the fake EmailSender and WebPush failing then succeeding.

## Comments

- 2026-09-29 — Filed at ticket 56's merge (owner decision 2026-09-29: accepted for 56, follow-up for the whole staff-alert system).
- 2026-09-30 — Builder (branch `ticket-91-staff-alert-retry`). Queued alerts (`notifications_peringatan_antrean`: Tier 1 `baru`/`eskalasi_30`/`eskalasi_90`, `penugasan_tpu`) are now retried by `kirimPeringatanAntreanTick`, using the family messages' own policy (`MAKS_PERCOBAAN` = 4 sends, `tundaUlangBerikutnya` = 15 min, 1 h, 4 h). Each attempt logs one row per channel it tried (`pesanStaf`); a channel that went through (`email_done_at` / `push_done_at`) is skipped afterwards, and the bell entry is written on the first attempt only. After the 4th failed send the row gets `gave_up_at` and stops; no call row (spec: failed staff alerts are not escalated). No Perangkat Push (or none left) counts as push done. Migration 0046 is expand-only (nullable columns, `attempts` default 0). Tests: `src/domain/notifications/peringatan-antrean-ulang.test.ts` (fake email and a push service failing then recovering). Ran notifications, queues, layanan/tpu, worker and tests/tooling: 35 files, 382 passed, 1 skipped; typecheck and lint clean; `npm run build` not run (no route change).

### Spec gaps and decisions for the owner

- Only queued alerts are retried. Staff alerts sent directly through `sendStaffAlert` (Saat Duka baru, Hak Pakai berakhir, Bukti Pencairan, Tidak Tertagih, tugas lapangan and others) are still one-shot; retrying them means queueing them too. Follow-up ticket?
- "Gave up" is recorded on the queue row (`gave_up_at`) and shows in the message log as the last attempt's `gagal`; there is no separate log status for it (`pesanStatuses` unchanged).
- Backoff ignores the 08:00-20:00 WIB window, as staff alerts have always been sent at any hour (Tier 1 is 24 h).

