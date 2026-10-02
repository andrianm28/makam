"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AlasanTolakLokasi } from "@/domain/pemesanan";
import type { TersediaUnit } from "@/domain/inventory";
import {
  batalkanPesanan,
  catatPemakaman,
  catatPembayaranLangsung,
  centangDokumen,
  konfirmasiPesanan,
  tolakPesanan,
  tawarkanAlternatifPesanan,
  type PesananActionState,
} from "./actions";

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
        <Select name="petakId" defaultValue={petak[0]?.petakId} items={Object.fromEntries(petak.map((unit) => [unit.petakId, labelPetak(unit)]))}>
          <SelectTrigger id="petakId">
            <SelectValue placeholder="Pilih petak" />
          </SelectTrigger>
          <SelectContent>
            {petak.map((unit) => (
              <SelectItem key={unit.petakId} value={unit.petakId}>
                {labelPetak(unit)}
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

/**
 * The order the Lokasi cannot serve, other than by refusing it (story 118): the
 * alternative it offers instead, and the Tolak with a reason off the fixed list.
 *
 * The reasons arrive as props from the server page, which reads the module's own
 * closed list — the same list the schema the action validates with is built from,
 * so the select and the domain can never disagree about what a Tolak is.
 */
export function AlternatifDanTolakForm({
  lokasiId,
  nomor,
  alasan,
  jenisMakam,
  pemakamanAwal,
  sudahDitawarkan,
}: {
  lokasiId: string;
  nomor: string;
  /**
   * The Lokasi's own half of the closed list, in the wording the family and the
   * Lokasi both read. A reason only the family can produce is not here and cannot
   * be: an offer the Lokasi never made cannot be one of its reasons.
   */
  alasan: { key: AlasanTolakLokasi; label: string }[];
  /** The Jenis Makam of this Lokasi Mitra, so the alternative is one of its own. */
  jenisMakam: { id: string; name: string }[];
  pemakamanAwal: string;
  sudahDitawarkan: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <TawarkanAlternatifForm lokasiId={lokasiId} nomor={nomor} jenisMakam={jenisMakam} pemakamanAwal={pemakamanAwal} sudahDitawarkan={sudahDitawarkan} />
      <TolakForm lokasiId={lokasiId} nomor={nomor} alasan={alasan} />
    </div>
  );
}

/** One alternative: another Jenis Makam of this Lokasi Mitra, another day, or both. */
function TawarkanAlternatifForm({
  lokasiId,
  nomor,
  jenisMakam,
  pemakamanAwal,
  sudahDitawarkan,
}: {
  lokasiId: string;
  nomor: string;
  jenisMakam: { id: string; name: string }[];
  pemakamanAwal: string;
  sudahDitawarkan: boolean;
}) {
  const [state, action, pending] = useActionState(tawarkanAlternatifPesanan, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="nomor" value={nomor} />
      <div className="flex flex-col gap-2">
        <label htmlFor="alternatifJenisMakam" className="text-sm font-medium">Tawarkan jenis makam lain</label>
        <Select name="jenisMakamId" defaultValue="">
          <SelectTrigger id="alternatifJenisMakam">
            <SelectValue placeholder="Jenis makam yang sama" />
          </SelectTrigger>
          <SelectContent>
            {jenisMakam.map((satu) => (
              <SelectItem key={satu.id} value={satu.id}>
                {satu.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="alternatifPemakaman" className="text-sm font-medium">Tawarkan tanggal lain</label>
        <Input id="alternatifPemakaman" name="pemakamanAt" type="datetime-local" defaultValue={pemakamanAwal} />
        <p className="text-small text-muted-foreground">
          Isi salah satu saja atau keduanya. Kosongkan yang tidak berubah; keluarga melihat total barunya sebelum menjawab.
        </p>
      </div>
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Mengirim…" : sudahDitawarkan ? "Ganti alternatif" : "Tawarkan alternatif"}
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

/** The Tolak: a reason off the fixed list, and nothing else to write. */
export function TolakForm({ lokasiId, nomor, alasan }: { lokasiId: string; nomor: string; alasan: { key: AlasanTolakLokasi; label: string }[] }) {
  const [state, action, pending] = useActionState(tolakPesanan, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="nomor" value={nomor} />
      <div className="flex flex-col gap-2">
        <label htmlFor="alasanTolak" className="text-sm font-medium">Alasan ditolak</label>
        <Select name="alasan" required>
          <SelectTrigger id="alasanTolak">
            <SelectValue placeholder="Pilih alasan" />
          </SelectTrigger>
          <SelectContent>
            {alasan.map((satu) => (
              <SelectItem key={satu.key} value={satu.key}>
                {satu.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-small text-muted-foreground">
          Daftar alasan ini tertutup dan keluarga membacanya persis seperti tertulis. Tim kami menelepon keluarga maksimal 2 jam.
        </p>
      </div>
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Menolak…" : "Tolak pesanan"}
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

/**
 * "Dibayar langsung ke Lokasi Mitra" (spec, Billing > Payment; ticket 30's AC
 * 2): the Admin Lokasi records that the family paid it directly, with proof.
 * The Tagihan becomes Lunas here; Payouts reads the same method to owe this
 * Lokasi no tariff Pencairan and the platform fee as a Potongan instead.
 */
export function PembayaranLangsungForm({ lokasiId, nomor, tagihanId }: { lokasiId: string; nomor: string; tagihanId: string }) {
  const [state, action, pending] = useActionState(catatPembayaranLangsung, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="nomor" value={nomor} />
      <input type="hidden" name="tagihanId" value={tagihanId} />
      <div className="flex flex-col gap-2">
        <label htmlFor="buktiLangsung" className="text-sm font-medium">
          Bukti pembayaran
        </label>
        <Input id="buktiLangsung" name="bukti" type="file" accept="image/jpeg,image/png,application/pdf" required />
        <p className="text-small text-muted-foreground">Foto atau PDF bukti keluarga membayar langsung ke Lokasi Mitra ini. Paling besar 10 MB.</p>
      </div>
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Mencatat…" : "Catat dibayar langsung"}
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

/** A cancellation the family asked for by phone: the reason is their own words, and the plot and the Tagihan go with it. */
export function BatalkanForm({ lokasiId, nomor, wajibAlasan }: { lokasiId: string; nomor: string; wajibAlasan: boolean }) {
  const [state, action, pending] = useActionState(batalkanPesanan, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="nomor" value={nomor} />
      <div className="flex flex-col gap-2">
        <label htmlFor="alasanBatal" className="text-sm font-medium">Alasan pembatalan</label>
        <Input
          id="alasanBatal"
          name="alasan"
          placeholder="Misalnya: keluarga menunda pemakaman"
          required={wajibAlasan}
          maxLength={500}
        />
        <p className="text-small text-muted-foreground">
          Setelah pesanan dikonfirmasi, alasannya wajib diisi. Petak kembali ke daftar, Tagihan dibatalkan, dan tidak ada biaya pembatalan.
        </p>
      </div>
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Membatalkan…" : "Catat pembatalan"}
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

/** How a Petak reads in the picker, in the list and on the closed trigger alike. */
function labelPetak(unit: TersediaUnit): string {
  return `${unit.nomor} (Blok ${unit.blok})`;
}
