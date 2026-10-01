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
- 2026-10-01 — Builder (branch `ticket-96`, head bbb83b0). Peringatan Staf yang dipicu langsung oleh peristiwa domain kini diantrekan, bukan dikirim di dalam request: tabel baru `notifications_peringatan_staf` (migrasi 0047, expand-only, `CREATE TABLE` + indeks parsial) menyimpan email/push lengkap, dan `Notifications.antrekanPeringatanStaf(alert, within?)` menulisnya (validasi lock-screen/staff-page tetap gagal cepat), sementara `kirimPeringatanStafTick` (tick worker baru `notifications.kirim_peringatan_staf`, tiap menit) mengirimnya dengan kebijakan ticket 91: 4 kiriman, jeda 15 mnt/1 jm/4 jm, transaksi per-alert `FOR UPDATE SKIP LOCKED`, lewati kanal yang sudah berhasil, lonceng sekali, idempoten, tanpa baris Telepon Pemesan. Pemanggil langsung dipindah ke antrean: `composition/pemesanan.ts` (Saat Duka baru, belum dikonfirmasi, Terencana baru), `composition/payouts.ts` (Bukti Pencairan), `domain/fieldwork/tugas.ts` (Tugas Lapangan baru, diantrekan di dalam transaksi `staffWrite`). `sendStaffAlert` tetap sebagai satu-satunya pengirim langsung yang dipakai tick dan Chasing (yang sudah punya antreannya sendiri). AC3: `kirimPeringatanAntreanTick` kini menjatuhkan retry `baru` (baris sudah diambil/ditutup) dan `eskalasi_90` (baris sudah ditutup) lewat `barisMasihTerbukaBelumDiambil`/`barisMasihTerbuka` dari Queues; antrean langsung punya callback `subjekMasihPerlu` per subjek. Tes: `peringatan-staf-ulang.test.ts` (email & push gagal lalu pulih, per-kanal, idempoten, menyerah setelah 4, subjek ditutup) dan tambahan di `peringatan-antrean-ulang.test.ts`.

  Keputusan/gap untuk owner: (1) peristiwa langsung mengumumkan **setelah** transaksinya commit (order rollback tidak boleh memberi peringatan); karena itu alert diantrekan sebagai efek pasca-commit, bukan di dalam transaksi order — hanya Tugas Lapangan yang ikut transaksi `staffWrite`; antrean tetap satu INSERT atomik. (2) Belum ada pemanggil langsung yang mengisi `subject`, jadi callback `subjekMasihPerlu` baru diuji dengan fake; menyambungkannya ke Pemesanan/Payouts perlu tiket lanjutan. (3) Peringatan Chasing (`staf_tagihan_lewat_jatuh_tempo`, `staf_tagihan_tidak_tertagih`) sudah punya antrean `notifications_message` sendiri dan sengaja tidak dipindah ke antrean baru ini; kebijakannya lease at-least-once, bukan 4-kiriman. (4) `sendStaffAlert` tetap publik dan langsung; domain event tidak boleh memanggilnya lagi.

