"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type MutableRefObject } from "react";
import { Check, Info, Minus, Phone, Plus, X } from "lucide-react";
import { totalTerencana } from "@/domain/pemesanan/harga-terencana";
import { formatRupiah } from "@/lib/rupiah";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { DenahView, KavlingView, SelView } from "./tampilan";
import { terencanaPath } from "./tautan";

/**
 * Step 2 of the Terencana wizard, "Pilih petak": the Denah with Blok tabs, the
 * legend of every state, the detail of the cell a family taps, and the total with
 * the "Nanti" line. Only cleared Tersedia Petak and a whole Tersedia Kavling
 * Keluarga can be picked; a Terisi plot that can still take a tumpang is not
 * pickable and says whom to ask instead. Every change to the selection is a URL,
 * so the browser's back button lands on the same Denah.
 */
export function DenahPicker({
  denah,
  petakAwal,
  kavlingAwal,
  sudahMasuk,
}: {
  denah: DenahView;
  petakAwal: string[];
  kavlingAwal: string | null;
  /** A signed-in Pemesan skips the Kode Masuk at Kirim. */
  sudahMasuk: boolean;
}) {
  const router = useRouter();
  const [blokId, setBlokId] = useState(denah.blok[0]?.id ?? "");
  const [ukuran, setUkuran] = useState(40);
  const [fokus, setFokus] = useState<SelView | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [pilihan, setPilihan] = useState<PilihanPicker>({ petak: petakAwal, kavling: kavlingAwal });
  const pinchRef = useRef<{ d: number; u: number } | null>(null);

  const blok = denah.blok.find((satu) => satu.id === blokId) ?? denah.blok[0];
  const semuaSel = denah.blok.flatMap((satu) => satu.cells);
  const semuaKavling = denah.blok.flatMap((satu) => satu.kavling);
  const kavlingTerpilih = semuaKavling.find((satu) => satu.nomor === pilihan.kavling) ?? null;
  const unitDipilih = [
    ...pilihan.petak.map((nomor) => ({ nomor, jenisMakamId: semuaSel.find((cell) => cell.nomor === nomor)?.jenisMakamId ?? "" })),
    ...(kavlingTerpilih ? [{ nomor: kavlingTerpilih.nomor, jenisMakamId: kavlingTerpilih.jenisMakamId }] : []),
  ];
  const rincian = totalTerencana(denah.harga, unitDipilih.map((unit) => unit.jenisMakamId));
  const ada = unitDipilih.length > 0;

  /** Tapping a cell: pick it, unpick it, or say why it cannot be picked. */
  function ketuk(cell: SelView) {
    setFokus(cell);
    if (cell.kavling) {
      const satu = semuaKavling.find((satu2) => satu2.id === cell.kavling!.id);
      if (!satu) return;
      if (satu.status !== "bisa_dipilih") {
        setPesan(kavlingSentence(satu));
        return;
      }
      if (pilihan.kavling === satu.nomor) {
        terapkan({ petak: [], kavling: null });
        return;
      }
      setPesan(pilihan.petak.length > 0 ? "Kavling Keluarga dipilih utuh sebagai satu unit, jadi petak yang tadi Anda pilih kami lepas." : null);
      terapkan({ petak: [], kavling: satu.nomor });
      return;
    }
    if (cell.status !== "bisa_dipilih") {
      setPesan(cell.tumpangSaja ? tumpangSentence(cell, denah) : petakSentence(cell));
      return;
    }
    if (pilihan.kavling) {
      setPesan("Petak tidak bisa digabung dengan Kavling Keluarga, jadi kavling yang tadi Anda pilih kami lepas.");
    } else {
      setPesan(null);
    }
    const next = pilihan.petak.includes(cell.nomor!) ? pilihan.petak.filter((nomor) => nomor !== cell.nomor) : [...pilihan.petak, cell.nomor!];
    terapkan({ petak: next, kavling: pilihan.kavling });
  }

  function terapkan(baru: PilihanPicker) {
    setPilihan(baru);
    router.replace(terencanaPath({ langkah: "petak", lokasiId: denah.lokasi.id, ...baru }), { scroll: false });
  }

  const terpilih = (cell: SelView) => (cell.kavling ? pilihan.kavling === cell.kavling.nomor : pilihan.petak.includes(cell.nomor ?? ""));

  return (
    <div className="flex flex-col gap-6">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Blok">
        {denah.blok.map((satu) => {
          const bisa = hitungTersedia(satu);
          const aktif = satu.id === blok?.id;
          return (
            <button
              key={satu.id}
              type="button"
              role="tab"
              aria-selected={aktif}
              onClick={() => {
                setBlokId(satu.id);
                setFokus(null);
              }}
              className={cn(
                "inline-flex h-11 shrink-0 flex-col items-start justify-center rounded-xl border px-4 text-left",
                aktif ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-card hover:bg-accent",
              )}
            >
              <span className="text-body leading-tight font-semibold">{satu.name}</span>
              <span className={cn("text-caption leading-tight", aktif ? "text-primary-foreground/80" : "text-muted-foreground")}>
                {bisa > 0 ? `${bisa} bisa dipilih` : "tidak ada yang tersedia"}
              </span>
            </button>
          );
        })}
      </div>

      {pesan ? (
        <div role="status" className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2.5 text-body text-info-soft-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="flex-1">{pesan}</p>
          <button type="button" onClick={() => setPesan(null)} className="text-small font-semibold underline underline-offset-2">
            Oke
          </button>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-small text-muted-foreground">
              {blok ? `${blok.name} · ${hitungTersedia(blok)} bisa dipilih` : null}
            </p>
            <div className="flex shrink-0 overflow-hidden rounded-lg border border-border bg-card">
              <button type="button" aria-label="Perkecil denah" onClick={() => setUkuran(Math.max(24, ukuran - 8))} className="inline-flex size-10 items-center justify-center hover:bg-accent">
                <Minus className="size-4" />
              </button>
              <button type="button" aria-label="Perbesar denah" onClick={() => setUkuran(Math.min(64, ukuran + 8))} className="inline-flex size-10 items-center justify-center border-l border-border hover:bg-accent">
                <Plus className="size-4" />
              </button>
            </div>
          </div>
          {blok ? (
            <Grid
              blok={blok}
              ukuran={ukuran}
              setUkuran={setUkuran}
              pinchRef={pinchRef}
              terpilih={terpilih}
              ketuk={ketuk}
              kavlingDipilih={pilihan.kavling}
            />
          ) : null}
          <ul className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-small text-foreground">
            <Legend swatch="border-2 border-sage-strong bg-card" label="Tersedia, bisa dipilih" />
            <Legend swatch="bg-primary" label="Pilihan Anda" />
            <Legend swatch="border border-warning bg-warning-soft" label="Dipesan" />
            <Legend swatch="bg-neutral-soft" label="Terisi" />
            <Legend swatch="bg-muted text-muted-foreground" label="Tidak Tersedia" />
            <Legend swatch="bg-muted-foreground/40" label="Perlu Verifikasi" />
            <Legend swatch="border-2 border-dashed border-sage-strong" label="Kavling Keluarga (satu unit)" />
            <Legend swatch="bg-highlight" label="Jalan" />
            <Legend swatch="border border-dashed border-border" label="Bukan petak (pohon, bangunan)" />
            <Legend
              swatch="bg-neutral-soft after:absolute after:bottom-0.5 after:right-0.5 after:size-1.5 after:rounded-full after:bg-sage-strong"
              label="Terisi, bisa untuk tumpang (hubungi Admin Lokasi)"
            />
          </ul>
          <Detail denah={denah} fokus={fokus} terpilih={terpilih} onTutup={() => setFokus(null)} />
        </div>

        <aside className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
            <p className="text-title-3 text-foreground">Pilihan Anda</p>
            <p className="text-body text-muted-foreground">{ada ? ringkasan(pilihan.petak, kavlingTerpilih) : "Belum ada petak dipilih. Ketuk petak yang Tersedia di denah."}</p>
            {ada && rincian.total !== null ? (
              <div className="flex flex-col gap-1 text-body tabular-nums">
                {unitDipilih.map((unit) => (
                  <div key={unit.nomor} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">Harga Hak Pakai · {unit.nomor}</span>
                    <span>{formatRupiah(denah.harga.find((satu) => satu.jenisMakamId === unit.jenisMakamId)?.hargaHakPakai ?? 0)}</span>
                  </div>
                ))}
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Biaya Layanan Platform · Makam.co.id</span>
                  <span>{formatRupiah(rincian.biayaLayananPlatform)}</span>
                </div>
                <div className="mt-1 flex justify-between gap-3 border-t border-border pt-1 font-semibold">
                  <span>Total</span>
                  <span>{formatRupiah(rincian.total)}</span>
                </div>
              </div>
            ) : null}
            {!rincian.dalamBatas ? (
              <p role="alert" className="rounded-lg bg-warning-soft px-3 py-2 text-small text-warning-soft-foreground">
                Total pilihan ini melewati batas pembayaran Rp 10.000.000 lewat QRIS, jadi jumlah ini tidak kami terima. Kurangi jumlah petak yang dipilih.
              </p>
            ) : null}
            {denah.nanti ? (
              <div className="rounded-xl bg-muted px-3 py-2.5 text-small">
                <p className="font-semibold">Nanti, setiap pemakaman</p>
                <p className="mt-0.5 text-muted-foreground">
                  Biaya Pemakaman + Biaya Layanan Platform, sesuai tarif saat pemakaman (saat ini {formatRupiah(denah.nanti.total)}). Dibayar setelah pemakaman, bukan sekarang.
                </p>
              </div>
            ) : null}
            <Button
              type="button"
              size="lg"
              disabled={!ada || !rincian.dalamBatas}
              onClick={() => router.push(terencanaPath({ langkah: "data", lokasiId: denah.lokasi.id, ...pilihan }))}
            >
              Lanjut
            </Button>
            <p className="text-caption text-muted-foreground">
              {sudahMasuk ? "Anda sudah masuk, jadi Data & kirim tidak meminta Kode Masuk lagi." : "Kode Masuk dikirim ke email Anda di langkah Data & kirim, bukan di sini."}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export interface PilihanPicker {
  petak: string[];
  kavling: string | null;
}

function hitungTersedia(blok: DenahView["blok"][number]): number {
  return blok.cells.filter((cell) => cell.status === "bisa_dipilih").length + blok.kavling.filter((satu) => satu.status === "bisa_dipilih").length;
}

/** The Blok's grid of cells, scrollable on a phone and pinch-zoomable. */
function Grid({
  blok,
  ukuran,
  setUkuran,
  pinchRef,
  terpilih,
  ketuk,
  kavlingDipilih,
}: {
  blok: DenahView["blok"][number];
  ukuran: number;
  setUkuran: (ukuran: number) => void;
  pinchRef: MutableRefObject<{ d: number; u: number } | null>;
  terpilih: (cell: SelView) => boolean;
  ketuk: (cell: SelView) => void;
  kavlingDipilih: string | null;
}) {
  const gap = 4;
  const pad = 10;
  return (
    <div className="rounded-2xl border border-border bg-card">
      <div
        className="max-h-[56vh] overflow-auto overscroll-contain lg:max-h-[34rem]"
        style={{ touchAction: "pan-x pan-y" }}
        onTouchStart={(event) => {
          if (event.touches.length !== 2) return;
          const [a, b] = [event.touches[0], event.touches[1]];
          pinchRef.current = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), u: ukuran };
        }}
        onTouchMove={(event) => {
          if (event.touches.length !== 2 || !pinchRef.current) return;
          const [a, b] = [event.touches[0], event.touches[1]];
          const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          setUkuran(Math.round(Math.min(64, Math.max(24, (pinchRef.current.u * d) / pinchRef.current.d))));
        }}
        onTouchEnd={() => {
          pinchRef.current = null;
        }}
      >
        <div className="relative" style={{ padding: pad, width: blok.cols * ukuran + (blok.cols - 1) * gap + pad * 2 }}>
          <div
            className="grid"
            style={{ gridTemplateColumns: `repeat(${blok.cols}, ${ukuran}px)`, gridAutoRows: `${ukuran}px`, gap }}
            role="group"
            aria-label={`Denah ${blok.name}`}
          >
            {blok.cells.map((cell) => (
              <Cell key={cell.id} cell={cell} terpilih={terpilih(cell)} ketuk={ketuk} />
            ))}
          </div>
          {blok.kavling.map((satu) => (
            <Kotak key={satu.id} kavling={satu} ukuran={ukuran} gap={gap} pad={pad} dipilih={kavlingDipilih === satu.nomor} />
          ))}
        </div>
      </div>
      <p className="px-4 py-2 text-caption text-muted-foreground lg:hidden">
        Geser untuk melihat seluruh blok; cubit atau pakai tombol +/− untuk memperbesar.
      </p>
    </div>
  );
}

/** One Denah cell: a Jalan and a Bukan Petak are drawn as they are, a Petak Makam is a button. */
function Cell({ cell, terpilih, ketuk }: { cell: SelView; terpilih: boolean; ketuk: (cell: SelView) => void }) {
  if (cell.kind === "jalan") return <div className="rounded-sm bg-highlight" aria-hidden />;
  if (cell.kind === "bukan_petak") return <div className="rounded-sm border border-dashed border-border" aria-hidden />;
  // A member Petak of a Kavling Keluarga is not a unit of its own: the outline around it is what is picked.
  if (cell.kavling) return <div className="rounded-sm bg-accent" aria-hidden />;
  return (
    <button
      type="button"
      title={`${cell.nomor ?? ""} · ${cell.jenisMakam ?? ""}`}
      aria-label={`${cell.nomor ?? ""}, ${cell.jenisMakam ?? ""}, ${terpilih ? "dipilih" : (statusLabel(cell.status) ?? "tidak bisa dipilih")}`}
      aria-pressed={terpilih}
      onClick={() => ketuk(cell)}
      className={cn(
        "relative flex items-center justify-center rounded-md text-[10px] leading-none font-semibold tabular-nums transition-colors select-none",
        terpilih ? "bg-primary text-primary-foreground" : null,
        !terpilih && cell.status === "bisa_dipilih" ? "border-2 border-sage-strong bg-card hover:bg-accent" : null,
        !terpilih && cell.status === "sedang_dipesan" ? "border border-warning bg-warning-soft text-warning-soft-foreground" : null,
        !terpilih && cell.status === "terisi" ? "bg-neutral-soft text-neutral-soft-foreground" : null,
        !terpilih && (cell.status === "tidak_tersedia" || cell.status === "masa_berlaku_habis") ? "bg-muted text-muted-foreground" : null,
        !terpilih && cell.status === "perlu_verifikasi" ? "bg-muted-foreground/40 text-background" : null,
        cell.tumpangSaja ? "after:absolute after:bottom-1 after:right-1 after:size-1.5 after:rounded-full after:bg-sage-strong" : null,
      )}
    >
      {terpilih ? <Check className="size-3.5" aria-hidden /> : (cell.nomor ?? "").split("-")[1]}
    </button>
  );
}

function Kotak({ kavling, ukuran, gap, pad, dipilih }: { kavling: KavlingView; ukuran: number; gap: number; pad: number; dipilih: boolean }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute rounded-lg border-2 border-dashed", dipilih ? "border-primary" : "border-sage-strong")}
      style={{
        left: pad + kavling.col * (ukuran + gap) - 4,
        top: pad + kavling.row * (ukuran + gap) - 4,
        width: kavling.cols * ukuran + (kavling.cols - 1) * gap + 8,
        height: kavling.rows * ukuran + (kavling.rows - 1) * gap + 8,
      }}
    >
      <span className={cn("absolute -top-2.5 left-1.5 rounded bg-card px-1 text-[10px] leading-tight font-semibold", dipilih ? "text-primary" : "text-sage-strong")}>
        {kavling.nomor}
      </span>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={cn("relative size-4 shrink-0 rounded", swatch)} aria-hidden />
      {label}
    </li>
  );
}

/** The tapped cell's own panel: its Nomor Makam, its Jenis Makam, and why it cannot be picked. */
function Detail({ denah, fokus, terpilih, onTutup }: { denah: DenahView; fokus: SelView | null; terpilih: (cell: SelView) => boolean; onTutup: () => void }) {
  if (!fokus) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-body text-muted-foreground">
        Ketuk petak untuk melihat Nomor Makam dan Jenis Makam-nya. Anda bisa memilih satu atau beberapa petak, atau satu Kavling Keluarga utuh.
      </div>
    );
  }
  const isi = fokus.tumpangSaja ? (
    <p>{tumpangSentence(fokus, denah)}</p>
  ) : fokus.status === "bisa_dipilih" ? (
    <p>
      {fokus.kavling ? "Kavling Keluarga ini dipilih utuh, dengan satu Hak Pakai untuk seluruh petaknya." : "Harga Hak Pakai petak ini sudah masuk di total pilihan Anda."}{" "}
      {terpilih(fokus) ? "Sudah Anda pilih; ketuk lagi untuk membatalkan." : "Ketuk untuk memilih."}
    </p>
  ) : (
    <p>{petakSentence(fokus)}</p>
  );
  return (
    <div className={cn("relative flex flex-col gap-2 rounded-2xl border bg-card p-4", fokus.status === "bisa_dipilih" ? "border-primary" : "border-border")}>
      <div className="flex items-start justify-between gap-3 pr-8">
        <div>
          <p className="font-mono text-title-2 text-foreground">{fokus.nomor}</p>
          <p className="text-small text-muted-foreground">{fokus.kavling ? "Kavling Keluarga" : fokus.jenisMakam}</p>
        </div>
        <span className={cn("rounded-full px-2.5 py-1 text-caption font-semibold", badgeClass(fokus.status))}>
          {terpilih(fokus) ? "Dipilih" : (statusLabel(fokus.status) ?? "")}
        </span>
      </div>
      {isi}
      {fokus.tumpangSaja && denah.kontakSiaga ? (
        <a href={`tel:${denah.kontakSiaga.telepon.replace(/-/g, "")}`} className="inline-flex items-center gap-1.5 font-semibold text-primary">
          <Phone className="size-4" aria-hidden /> Hubungi Admin Lokasi: {denah.kontakSiaga.nama}, {denah.kontakSiaga.telepon}
        </a>
      ) : null}
      <button type="button" onClick={onTutup} aria-label="Tutup detail petak" className="absolute top-2 right-2 inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent">
        <X className="size-4" />
      </button>
    </div>
  );
}

function badgeClass(status: string | null): string {
  switch (status) {
    case "bisa_dipilih":
      return "bg-success-soft text-success-soft-foreground";
    case "sedang_dipesan":
      return "bg-warning-soft text-warning-soft-foreground";
    default:
      return "bg-neutral-soft text-neutral-soft-foreground";
  }
}

/** The legend's word for a state, and the same word on a cell's badge. */
function statusLabel(status: string | null): string | null {
  switch (status) {
    case "bisa_dipilih":
      return "Tersedia";
    case "sedang_dipesan":
      return "Dipesan";
    case "terisi":
      return "Terisi";
    case "tidak_tersedia":
      return "Tidak Tersedia";
    case "perlu_verifikasi":
      return "Perlu Verifikasi";
    case "masa_berlaku_habis":
      return "Masa Berlaku Habis";
    default:
      return null;
  }
}

/** Why a Petak cannot be picked, one sentence each. */
function petakSentence(cell: SelView): string {
  const nomor = cell.nomor ?? "Petak ini";
  switch (cell.status) {
    case "sedang_dipesan":
      return `${nomor} sedang dipesan keluarga lain, jadi tidak bisa dipilih.`;
    case "terisi":
      return `${nomor} sudah ada pemakaman di sana, jadi tidak bisa dipilih.`;
    case "tidak_tersedia":
      return `${nomor} sedang tidak dijual oleh lokasi, jadi tidak bisa dipilih.`;
    case "perlu_verifikasi":
      return `${nomor} baru digambar di denah dan belum dikonfirmasi lokasi, jadi belum bisa dipilih.`;
    case "masa_berlaku_habis":
      return `Masa Hak Pakai ${nomor} sudah habis, jadi tidak bisa dipilih.`;
    default:
      return `${nomor} tidak bisa dipilih.`;
  }
}

function kavlingSentence(kavling: KavlingView): string {
  return kavling.status === "sedang_dipesan"
    ? `Kavling Keluarga ${kavling.nomor} sedang dipesan keluarga lain, jadi tidak bisa dipilih.`
    : `Kavling Keluarga ${kavling.nomor} sudah dipakai, jadi tidak bisa dipilih.`;
}

/** A Terisi plot that can still take a tumpang: a tumpang is arranged with the Admin Lokasi, not bought here. */
function tumpangSentence(cell: SelView, denah: DenahView): string {
  const siapa = denah.kontakSiaga ? `: ${denah.kontakSiaga.nama}, ${denah.kontakSiaga.telepon}` : ".";
  return cell.kavling
    ? `Kavling Keluarga ${cell.kavling.nomor} sudah terisi dan hanya bisa dipakai untuk tumpang. Pengaturannya lewat Admin Lokasi${siapa}`
    : `${cell.nomor} sudah terisi dan hanya bisa dipakai untuk tumpang (pemakaman di makam yang sudah ada). Pengaturannya lewat Admin Lokasi${siapa}`;
}

/** What the family chose, as one line. */
function ringkasan(petak: string[], kavling: KavlingView | null): string {
  if (kavling) return `Kavling Keluarga ${kavling.nomor}`;
  return `${petak.length} Petak · ${petak.join(", ")}`;
}
