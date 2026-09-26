"use client";

/*
 * PROTOTYPE, throwaway. The Denah editor's side panels: the tapped cell's
 * detail, the bottom bulk-edit action bar (phone tap-select and desktop
 * drag-select alike), the per-Blok summary, and the "Unggah foto belum
 * tersedia" staging stub.
 */
import { ImageOff, Lock, Route, ScanLine, Square, TreePine, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Blok, type Lokasi, type Sel, dipakai, ringkasan, statusPetak } from "./model";

export function DetailPanel({
  lokasi,
  blok,
  sel,
  onClose,
  onPisahkanKavling,
}: {
  lokasi: Lokasi;
  blok: Blok;
  sel: Sel | null;
  onClose: () => void;
  onPisahkanKavling?: (nomorKavling: string) => void;
}) {
  if (!sel) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-body text-muted-foreground">
        Ketuk satu sel untuk melihat detailnya: Nomor Makam, Jenis Makam, atau kenapa sel itu tidak bisa diubah.
      </div>
    );
  }

  if (sel.jenis === "jalan" || sel.jenis === "bukan") {
    const Icon = sel.jenis === "jalan" ? Route : TreePine;
    return (
      <div className="relative flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
        <button type="button" onClick={onClose} aria-label="Tutup detail" className="absolute top-2 right-2 inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent lg:hidden">
          <X className="size-4" />
        </button>
        <div className="flex items-center gap-2 text-foreground">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          <p className="text-title-3">{sel.jenis === "jalan" ? "Jalan" : "Bukan Petak"}</p>
        </div>
        <p className="text-body text-muted-foreground">
          {sel.jenis === "jalan" ? "Jalur antar makam, bukan Petak Makam." : "Bukan Petak Makam maupun Jalan (pohon, bangunan, atau lahan yang belum dibuka)."} Pilih lalu gunakan
          bilah aksi untuk menjadikannya Petak Makam.
        </p>
      </div>
    );
  }

  const status = statusPetak(sel, blok);
  const kav = sel.kavling ? blok.kavling.find((k) => k.nomor === sel.kavling) : undefined;
  const j = lokasi.jenisMakam.find((x) => x.id === (kav?.jenisMakam ?? sel.jenisMakam));
  const hp = kav?.hakPakai ?? sel.hakPakai;
  const terpakai = dipakai(sel, blok);

  return (
    <div className="relative flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <button type="button" onClick={onClose} aria-label="Tutup detail" className="absolute top-2 right-2 inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent lg:hidden">
        <X className="size-4" />
      </button>
      <div className="flex items-start justify-between gap-3 pr-8 lg:pr-0">
        <div>
          <p className="font-mono text-title-2 text-foreground">{sel.nomor}</p>
          <p className="text-small text-muted-foreground">
            {j?.nama ?? "Jenis Makam belum diatur"}
            {kav ? ` · Kavling Keluarga ${kav.nomor}` : ""}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-caption font-semibold",
            status === "Tersedia"
              ? "bg-success-soft text-success-soft-foreground"
              : status === "Dipesan"
                ? "bg-warning-soft text-warning-soft-foreground"
                : status === "Terisi"
                  ? "bg-neutral-soft text-neutral-soft-foreground"
                  : "bg-muted text-muted-foreground",
          )}
        >
          {status}
        </span>
      </div>

      {sel.perluVerifikasi ? (
        <p className="flex items-center gap-1.5 rounded-lg bg-warning-soft px-2.5 py-1.5 text-small text-warning-soft-foreground">
          <ScanLine className="size-3.5 shrink-0" aria-hidden /> Perlu Verifikasi: belum dikonfirmasi Admin Lokasi, jadi belum bisa ditugaskan atau dijual.
        </p>
      ) : null}

      {terpakai ? (
        <div className="flex flex-col gap-1.5 rounded-lg bg-muted px-3 py-2.5 text-body text-foreground">
          <p className="flex items-center gap-1.5 font-medium">
            <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> Punya Hak Pakai, jadi tidak bisa dihapus, dipindah, atau diganti jenis selnya.
          </p>
          <p className="text-small text-muted-foreground">Pemegang Hak: {hp?.pemegangHak}</p>
          {hp?.pemakaman.length ? (
            <ul className="text-small text-muted-foreground">
              {hp.pemakaman.map((p, i) => (
                <li key={i}>
                  Pemakaman: {p.almarhum}, {p.tanggal}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-small text-muted-foreground">Belum ada Pemakaman.</p>
          )}
          {hp?.tumpangSaja ? <p className="text-small text-muted-foreground">Hak Pakai sudah berakhir; sisa dijual hanya untuk tumpang.</p> : null}
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-body text-muted-foreground">
          <Square className="size-3.5 shrink-0" aria-hidden /> Belum pernah dipakai: bisa dihapus, dipindah baris/kolomnya, atau diganti jenis selnya.
        </p>
      )}

      {kav && !terpakai && onPisahkanKavling ? (
        <button
          type="button"
          onClick={() => onPisahkanKavling(kav.nomor)}
          className="self-start text-small font-semibold text-forest underline underline-offset-2"
        >
          Pisahkan dari Kavling Keluarga {kav.nomor}
        </button>
      ) : null}
    </div>
  );
}

export function Summary({ lokasi, blok }: { lokasi: Lokasi; blok: Blok }) {
  const r = ringkasan(blok, lokasi);
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-title-3 text-foreground">Ringkasan {blok.nama}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-small">
        <Row label="Petak Makam" value={r.petak} />
        <Row label="Jalan" value={r.jalan} />
        <Row label="Bukan Petak" value={r.bukan} />
        <Row label="Kavling Keluarga" value={r.kavling} />
        <Row label="Perlu Verifikasi" value={r.perluVerifikasi} warn={r.perluVerifikasi > 0} />
        <Row label="Sudah dipakai" value={r.dipakai} />
      </dl>
      {r.perJenis.length ? (
        <>
          <p className="mt-3 text-small font-medium text-foreground">Per Jenis Makam</p>
          <ul className="mt-1 flex flex-col gap-1 text-small text-muted-foreground">
            {r.perJenis.map(({ jenis, jumlah }) => (
              <li key={jenis.id} className="flex items-center justify-between">
                <span>{jenis.nama}</span>
                <span className="font-medium text-foreground tabular-nums">{jumlah}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function Row({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("font-medium tabular-nums", warn ? "text-warning-soft-foreground" : "text-foreground")}>{value}</dd>
    </div>
  );
}

export function FotoStub({ blok }: { blok: Blok }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border-strong bg-card p-6 text-center">
      <ImageOff className="size-6 text-muted-foreground" aria-hidden />
      <p className="text-body font-medium text-foreground">Unggah foto belum tersedia</p>
      <p className="text-small text-muted-foreground">
        Foto denah lokasi untuk {blok.nama} akan bisa diunggah setelah penyimpanan berkas siap. Sementara ini gunakan grid di atas sebagai acuan.
      </p>
    </div>
  );
}
