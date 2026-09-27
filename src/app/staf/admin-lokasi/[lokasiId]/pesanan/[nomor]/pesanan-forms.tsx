"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TersediaUnit } from "@/domain/inventory";
import { centangDokumen, catatPemakaman, konfirmasiPesanan, type PesananActionState } from "./actions";

const idle: PesananActionState = { status: "idle" };

/**
 * The confirmation itself (spec, story 117): one cleared Tersedia Petak of the
 * order's own Jenis Makam, and the burial the Lokasi agrees with the family. The
 * Hak Pakai and the pay-after Tagihan follow from this one step.
 */
export function KonfirmasiForm({
  lokasiId,
  nomor,
  petak,
  pemakamanAwal,
}: {
  lokasiId: string;
  nomor: string;
  petak: TersediaUnit[];
  /** The family's plan, as `datetime-local` holds it; the Lokasi may change the day. */
  pemakamanAwal: string;
}) {
  const [state, action, pending] = useActionState(konfirmasiPesanan, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="nomor" value={nomor} />
      <div className="flex flex-col gap-2">
        <label htmlFor="petakId" className="text-sm font-medium">Petak Makam</label>
        <Select name="petakId" defaultValue={petak[0]?.petakId}>
          <SelectTrigger id="petakId">
            <SelectValue placeholder="Pilih petak" />
          </SelectTrigger>
          <SelectContent>
            {petak.map((unit) => (
              <SelectItem key={unit.petakId} value={unit.petakId}>
                {unit.nomor} (Blok {unit.blok})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-small text-muted-foreground">
          Hanya petak yang sudah dicek dan masih kosong dari jenis makam yang dipesan.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="pemakamanAt" className="text-sm font-medium">Pemakaman</label>
        <Input id="pemakamanAt" name="pemakamanAt" type="datetime-local" defaultValue={pemakamanAwal} required />
        <p className="text-small text-muted-foreground">Tanggal jam pemakaman, sesuai zona waktu lokasi.</p>
      </div>
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" disabled={pending || petak.length === 0}>
          {pending ? "Mengonfirmasi…" : "Konfirmasi pesanan"}
        </Button>
        {petak.length === 0 ? (
          <p className="text-small text-danger-soft-foreground">
            Tidak ada petak kosong dari jenis makam ini. Bersihkan petak di Denah lebih dulu, atau tawarkan alternatif.
          </p>
        ) : null}
        {state.status !== "idle" ? (
          <p role={state.status === "gagal" ? "alert" : "status"} className="text-caption text-muted-foreground">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

/**
 * The burial, the day it actually happened (spec, Inventory > Pemakaman; the
 * Antrean Lokasi's "Catat Pemakaman" row asks for it the day after the agreed
 * date). Two facts only: the day and the layer — the plot and the Almarhum are
 * the order's own.
 */
export function CatatPemakamanForm({
  lokasiId,
  nomor,
  tanggalAwal,
  layerAwal,
  hariIni,
}: {
  lokasiId: string;
  nomor: string;
  /** The agreed burial day, as a `date` input holds it; the Lokasi corrects it when the burial moved. */
  tanggalAwal: string;
  layerAwal: number;
  /** Today in WIB from the Clock, which is the last day a burial may be recorded for. */
  hariIni: string;
}) {
  const [state, action, pending] = useActionState(catatPemakaman, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="nomor" value={nomor} />
      <div className="flex flex-col gap-2">
        <label htmlFor="tanggal" className="text-sm font-medium">Tanggal pemakaman</label>
        <Input id="tanggal" name="tanggal" type="date" defaultValue={tanggalAwal} max={hariIni} required />
        <p className="text-small text-muted-foreground">
          Hari pemakaman benar-benar dilaksanakan. Masa Hak Pakai dihitung dari tanggal ini, bukan dari rencana.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="layer" className="text-sm font-medium">Lapis</label>
        <Input id="layer" name="layer" type="number" min={1} max={20} defaultValue={layerAwal} required />
        <p className="text-small text-muted-foreground">Lapis petak yang dipakai. Isi 1 untuk pemakaman pertama.</p>
      </div>
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Mencatat…" : "Catat pemakaman"}
        </Button>
        {state.status !== "idle" ? (
          <p role={state.status === "gagal" ? "alert" : "status"} className="text-caption text-muted-foreground">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

/** One tick per checklist item (spec, story 120): what the family brought, ticked off. */
export function CentangDokumenForm({ lokasiId, nomor, nama, sudah }: { lokasiId: string; nomor: string; nama: string; sudah: boolean }) {
  const [state, action, pending] = useActionState(centangDokumen, idle);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="nomor" value={nomor} />
      <input type="hidden" name="nama" value={nama} />
      <Button type="submit" variant={sudah ? "outline" : "secondary"} size="sm" disabled={pending || sudah}>
        {sudah ? "Sudah ada" : "Tandai sudah ada"}
      </Button>
      {state.status !== "idle" ? (
        <span role={state.status === "gagal" ? "alert" : "status"} className="text-caption text-muted-foreground">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
