"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatRupiah } from "@/lib/rupiah";
import { jawabAlternatifAction, batalkanPesananAction, type PesananActionState } from "./actions";

const idle: PesananActionState = { status: "idle" };

/**
 * The alternative the Lokasi offered, answered with one tap (spec, story 31: "I
 * want to accept or decline an alternative the Admin Lokasi offers … with one
 * tap, seeing the new all-in total"). Both buttons are on the same screen as the
 * total and the lines behind it, so the decision is made on the real number and
 * not on a promise.
 *
 * Refusing is a Tolak, and says so: the order ends as ditolak, the family is
 * emailed with a link back to Pilih makam, and a staff member phones within 2 h.
 */
export function AlternatifForm({
  nomor,
  jenisMakam,
  pemakamanLabel,
  total,
  lines,
}: {
  nomor: string;
  /** The new Jenis Makam; null while only the day is offered. */
  jenisMakam: string | null;
  /** The new burial, as the page worded it; null while only the Jenis Makam is offered. */
  pemakamanLabel: string | null;
  total: number;
  lines: { label: string; amount: number }[];
}) {
  const [state, action, pending] = useActionState(jawabAlternatifAction, idle);
  return (
    <section className="flex flex-col gap-4" data-testid="alternatif-ditawarkan">
      <h2 className="text-title-3 text-foreground">Lokasi Mitra menawarkan pilihan lain</h2>
      <p className="text-body text-muted-foreground">
        {[jenisMakam, pemakamanLabel].filter(Boolean).join(", ")}. Total semua biaya{" "}
        <strong className="text-foreground">{formatRupiah(total)}</strong>.
      </p>
      <dl className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5 text-body">
        {lines.map((baris) => (
          <div key={baris.label} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{baris.label}</dt>
            <dd className="whitespace-nowrap tabular-nums">{formatRupiah(baris.amount)}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center gap-3">
        <form action={action}>
          <input type="hidden" name="nomor" value={nomor} />
          <input type="hidden" name="terima" value="ya" />
          <Button type="submit" disabled={pending}>
            {pending ? "Mengirim…" : "Terima pilihan ini"}
          </Button>
        </form>
        <form action={action}>
          <input type="hidden" name="nomor" value={nomor} />
          <input type="hidden" name="terima" value="tidak" />
          <Button type="submit" variant="outline" disabled={pending}>
            Tolak pilihan ini
          </Button>
        </form>
      </div>
      {state.status !== "idle" ? (
        <p role={state.status === "gagal" ? "alert" : "status"} className="text-small text-muted-foreground">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Cancelling the order (spec, story 34): a free field, and it is required once
 * the order is confirmed because by then a plot and a bill are being given up.
 * The screen never says what will be refunded — the module knows, and the answer
 * says it after the fact.
 */
export function BatalkanForm({ nomor, wajibAlasan }: { nomor: string; wajibAlasan: boolean }) {
  const [state, action, pending] = useActionState(batalkanPesananAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="nomor" value={nomor} />
      <div className="flex flex-col gap-2">
        <label htmlFor="alasan-pembatalan" className="text-body font-medium text-foreground">
          Alasan pembatalan
        </label>
        <Input id="alasan-pembatalan" name="alasan" maxLength={500} required={wajibAlasan} placeholder="boleh dikosongkan sebelum pesanan dikonfirmasi" />
        {wajibAlasan ? (
          <p className="text-small text-muted-foreground">
            Pesanan sudah dikonfirmasi, jadi petak sudah Dialokasikan. Alasan ini kami catat supaya Lokasi Mitra tahu sebabnya.
          </p>
        ) : (
          <p className="text-small text-muted-foreground">Belum ada apa pun yang dibayar, jadi membatalkan tidak membebaskan biaya apa pun.</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Membatalkan…" : "Batalkan pesanan ini"}
        </Button>
        {state.status !== "idle" ? (
          <p role={state.status === "gagal" ? "alert" : "status"} className="text-small text-muted-foreground">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
