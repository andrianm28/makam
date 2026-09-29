"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AlasanTolakTerencana } from "@/domain/pemesanan";
import type { PesananActionState } from "./actions";
import {
  konfirmasiTerencanaAction,
  mintaPerbaikanPembatalanTerencanaAction,
  setujuiPembatalanTerencanaAction,
  tolakPembatalanTerencanaAction,
  tolakTerencanaAction,
} from "./terencana-actions";

const idle: PesananActionState = { status: "idle" };

/** What a form says back: a refusal is an alert, a success a status. */
function Umpanbalik({ state }: { state: PesananActionState }) {
  if (state.status === "idle") return null;
  return (
    <p role={state.status === "gagal" ? "alert" : "status"} className="text-caption text-muted-foreground">
      {state.message}
    </p>
  );
}

/**
 * The confirmation (spec, story 46): one step, no plot to choose. It starts the payment
 * hold and issues the pay-first Tagihan, which is due when the hold ends.
 */
export function KonfirmasiTerencanaForm({ lokasiId, nomor, jamTahan }: { lokasiId: string; nomor: string; jamTahan: number | null }) {
  const [state, action, pending] = useActionState(konfirmasiTerencanaAction, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="nomor" value={nomor} />
      <p className="text-small text-muted-foreground">
        {jamTahan === null ? "Petak ditahan sejak konfirmasi." : `Petak ditahan ${jamTahan} jam sejak konfirmasi.`} Tagihan terbit sekarang dan jatuh tempo saat penahanan berakhir; kalau belum
        dibayar, pesanan dibatalkan dan petaknya dilepas.
      </p>
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" disabled={pending} data-testid="konfirmasi-terencana">
          {pending ? "Mengonfirmasi…" : "Konfirmasi pesanan"}
        </Button>
        <Umpanbalik state={state} />
      </div>
    </form>
  );
}

/**
 * The Tolak with a reason off the closed list. The reasons arrive as props from the
 * server page, which reads the module's own list, so the select and the domain can
 * never disagree about what a Tolak is.
 */
export function TolakTerencanaForm({
  lokasiId,
  nomor,
  alasan,
}: {
  lokasiId: string;
  nomor: string;
  alasan: { key: AlasanTolakTerencana; label: string }[];
}) {
  const [state, action, pending] = useActionState(tolakTerencanaAction, idle);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="nomor" value={nomor} />
      <div className="flex flex-col gap-2">
        <label htmlFor="alasanTolakTerencana" className="text-sm font-medium">Alasan ditolak</label>
        <Select name="alasan" required>
          <SelectTrigger id="alasanTolakTerencana">
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
          Daftar alasan ini tertutup dan keluarga membacanya persis seperti tertulis. Petak yang ditahan dilepas, dan keluarga diajak
          memilih Lokasi Mitra lain.
        </p>
      </div>
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" variant="outline" disabled={pending} data-testid="tolak-terencana">
          {pending ? "Menolak…" : "Tolak pesanan"}
        </Button>
        <Umpanbalik state={state} />
      </div>
    </form>
  );
}

/**
 * Approving a Pembatalan: the Admin Lokasi's one confirmation that there is no Pemakaman at any plot of the
 * order. Everything that follows (the Hak Pakai ended, the Petak freed, the refund asked) is the module's.
 */
export function SetujuiPembatalanForm({ lokasiId, nomor, permintaanId }: { lokasiId: string; nomor: string; permintaanId: string }) {
  const [state, action, pending] = useActionState(setujuiPembatalanTerencanaAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="nomor" value={nomor} />
      <input type="hidden" name="id" value={permintaanId} />
      <p className="text-small text-muted-foreground">
        Dengan menyetujui, Anda memastikan belum ada Pemakaman di petak ini. Hak Pakai petak ini dibatalkan dan petaknya kembali Tersedia untuk Anda jual lagi;
        petak lain pada pesanan ini tidak berubah. Pengembalian dana diminta dari Admin Platform. Ini tidak bisa dibatalkan.
      </p>
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" disabled={pending} data-testid="setujui-pembatalan">
          {pending ? "Menyetujui…" : "Setujui Pembatalan"}
        </Button>
        <Umpanbalik state={state} />
      </div>
    </form>
  );
}

/** Declining a Pembatalan, with the reason the family reads. */
export function TolakPembatalanForm({ lokasiId, nomor, permintaanId }: { lokasiId: string; nomor: string; permintaanId: string }) {
  const [state, action, pending] = useActionState(tolakPembatalanTerencanaAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="nomor" value={nomor} />
      <input type="hidden" name="id" value={permintaanId} />
      <div className="flex flex-col gap-2">
        <label htmlFor={`alasan-tolak-pembatalan-${permintaanId}`} className="text-sm font-medium">
          Alasan ditolak
        </label>
        <Input id={`alasan-tolak-pembatalan-${permintaanId}`} name="alasan" required maxLength={500} />
        <p className="text-small text-muted-foreground">Keluarga membaca alasan ini apa adanya. Hak Pakai tidak berubah.</p>
      </div>
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" variant="outline" disabled={pending} data-testid="tolak-pembatalan">
          {pending ? "Menolak…" : "Tolak Pembatalan"}
        </Button>
        <Umpanbalik state={state} />
      </div>
    </form>
  );
}

/** Sending a Pembatalan back for a fix, saying what to fix. */
export function MintaPerbaikanPembatalanForm({ lokasiId, nomor, permintaanId }: { lokasiId: string; nomor: string; permintaanId: string }) {
  const [state, action, pending] = useActionState(mintaPerbaikanPembatalanTerencanaAction, idle);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="lokasiId" value={lokasiId} />
      <input type="hidden" name="nomor" value={nomor} />
      <input type="hidden" name="id" value={permintaanId} />
      <div className="flex flex-col gap-2">
        <label htmlFor={`catatan-perbaikan-${permintaanId}`} className="text-sm font-medium">
          Yang perlu diperbaiki
        </label>
        <Input id={`catatan-perbaikan-${permintaanId}`} name="catatan" required maxLength={500} />
        <p className="text-small text-muted-foreground">
          Permintaan kembali ke keluarga dan keluar dari Antrean Lokasi sampai diajukan kembali. Besar pengembalian dananya tidak berubah.
        </p>
      </div>
      <div className="flex flex-col items-start gap-2">
        <Button type="submit" variant="outline" disabled={pending} data-testid="minta-perbaikan-pembatalan">
          {pending ? "Mengirim…" : "Minta perbaikan"}
        </Button>
        <Umpanbalik state={state} />
      </div>
    </form>
  );
}
