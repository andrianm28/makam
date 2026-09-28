"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { labelBuktiPekerjaan } from "@/lib/layanan-labels";
import type { BuktiPekerjaan, PekerjaanUntukStaf } from "@/domain/layanan";
import { AmbilBukti } from "./ambil-bukti";
import { mulaiPekerjaanLokasi, selesaikanPekerjaanLokasi, selesaikanVerifikasiHakPakaiLokasi, type PekerjaanActionState } from "./actions";

const initialState: PekerjaanActionState = { status: "idle" };

/**
 * The three steps of one job, in the order they happen and no other: **Mulai**,
 * **Ambil bukti** with the app's camera, **Selesai** — and Selesai is disabled
 * until every proof the Layanan's kind requires is there, with the missing ones
 * named. The Admin Lokasi is standing at the grave with a phone in their hand, so
 * the screen says what is still to be taken rather than a reason code.
 */
export function LangkahPekerjaan({ lokasiId, pekerjaan }: { lokasiId: string; pekerjaan: PekerjaanUntukStaf }) {
  const sudah = new Set(pekerjaan.bukti.map((satu) => satu.kind));
  // The page computed which proofs this job must carry, from the Layanan's own kind;
  // this screen never chooses them.
  // The page computed which proofs this job must carry, from the Layanan's own
  // kind; this screen never chooses them, it only walks the list.
  const dibutuhkan = pekerjaan.dibutuhkan;
  const ditutup = pekerjaan.status === "selesai" || pekerjaan.status === "dibatalkan" || pekerjaan.status === "keluhan";

  return (
    <>
      {pekerjaan.hakPakaiPerluVerifikasi ? <VerifikasiHakPakai lokasiId={lokasiId} petakId={pekerjaan.petak.id} /> : null}
      <Mulai lokasiId={lokasiId} pekerjaan={pekerjaan} />
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4" aria-labelledby="bukti-heading">
        <h2 id="bukti-heading" className="text-body font-semibold">
          Bukti pekerjaan
        </h2>
        <p className="text-small text-muted-foreground">Diambil lewat kamera di aplikasi ini, dengan waktu pengambilan ikut tersimpan.</p>
        {dibutuhkan.map((kind) => (
          <AmbilBukti key={kind} lokasiId={lokasiId} pekerjaanId={pekerjaan.id} kind={kind} sudahAda={sudah.has(kind)} />
        ))}
        {pekerjaan.bukti.length > 0 ? (
          <ul className="flex flex-col gap-1 text-small text-muted-foreground">
            {pekerjaan.bukti.map((satu) => (
              <li key={satu.kind}>
                {labelBuktiPekerjaan(satu.kind)}
                {satu.url ? (
                  <a href={satu.url} target="_blank" rel="noopener" className="ml-2 font-medium text-brand underline underline-offset-4">
                    lihat
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      {!ditutup ? <Selesai lokasiId={lokasiId} pekerjaan={pekerjaan} kurang={pekerjaan.kurang} /> : null}
    </>
  );
}

/**
 * **The gate, and its exit.** A Hak Pakai flagged Perlu Verifikasi holds this job
 * back: the family has paid, but the Lokasi has to complete the grave's record
 * before the work can be scheduled (AC 1). The screen says so in the words the
 * Admin Lokasi uses, and gives the one call that opens it — completing the Hak Pakai
 * is the Lokasi's own, and nothing else about this screen changes.
 */
function VerifikasiHakPakai({ lokasiId, petakId }: { lokasiId: string; petakId: string }) {
  const [state, formAction, pending] = useActionState(selesaikanVerifikasiHakPakaiLokasi, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-lg border border-border bg-warning-soft p-4">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="petakId" value={petakId} />
      <p className="text-body font-semibold">Hak Pakai petak ini belum dilengkapi</p>
      <p className="text-small text-muted-foreground">
        Record Hak Pakai petak ini masih perlu diverifikasi, jadi pekerjaan menunggu dan belum masuk jadwal. Setelah dilengkapi, pekerjaan ini masuk daftar Antrean pada tick berikutnya.
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? "Menyimpan…" : "Tandai Hak Pakai sudah dilengkapi"}
      </Button>
      {state.status === "gagal" ? (
        <p role="alert" className="text-small text-destructive">
          {state.message}
        </p>
      ) : null}
      {state.status === "berhasil" ? (
        <p role="status" className="text-small text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/** The first step: the job is being worked on now. */
function Mulai({ lokasiId, pekerjaan }: { lokasiId: string; pekerjaan: PekerjaanUntukStaf }) {
  const [state, formAction, pending] = useActionState(mulaiPekerjaanLokasi, initialState);
  if (pekerjaan.status !== "dijadwalkan" && pekerjaan.status !== "terlambat") return null;
  return (
    <form action={formAction} className="rounded-lg border border-border bg-card p-4">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="pekerjaanId" value={pekerjaan.id} />
      <Button type="submit" disabled={pending}>
        {pending ? "Menandai…" : "Mulai kerjakan"}
      </Button>
      {state.status === "gagal" ? (
        <p role="alert" className="mt-2 text-small text-destructive">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/** The last step, and the gate: Selesai is refused until every required proof is there. */
function Selesai({ lokasiId, pekerjaan, kurang }: { lokasiId: string; pekerjaan: PekerjaanUntukStaf; kurang: BuktiPekerjaan[] }) {
  const [state, formAction, pending] = useActionState(selesaikanPekerjaanLokasi, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="pekerjaanId" value={pekerjaan.id} />
      <Button type="submit" disabled={pending || kurang.length > 0}>
        {pending ? "Menyimpan…" : "Tandai selesai"}
      </Button>
      {kurang.length > 0 ? (
        <p className="text-small text-muted-foreground" data-testid="bukti-kurang">
          Belum bisa ditandai selesai. Kurang: {kurang.map((kind) => labelBuktiPekerjaan(kind)).join(", ")}.
        </p>
      ) : (
        <p className="text-small text-muted-foreground">Semua bukti lengkap. Bukti dikirim ke pemesan begitu ini disimpan.</p>
      )}
      {state.status === "gagal" ? (
        <p role="alert" className="text-small text-destructive">
          {state.message}
        </p>
      ) : null}
      {state.status === "berhasil" ? (
        <p role="status" className="text-small text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
