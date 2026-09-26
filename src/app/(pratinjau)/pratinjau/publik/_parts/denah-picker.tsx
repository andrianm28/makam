"use client";

/*
 * PROTOTYPE, throwaway. The Denah picker for the Terencana wizard: Blok tabs,
 * the grid of Petak Makam / Jalan / Bukan Petak cells, Kavling Keluarga
 * outlined, a legend, a detail panel for the tapped cell, zoom buttons and
 * two-finger pinch on phones.
 */
import { useRef, useState } from "react";
import { Check, Info, Minus, Phone, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { rupiah, type LokasiMitra } from "../_mock/data";
import { jumlahTersedia, semuaPetak, type Blok, type Denah, type Kavling, type Sel } from "../_mock/denah";

export type Pilihan = { jenis: "petak"; nomor: string[] } | { jenis: "kavling"; nomor: string } | { jenis: "kosong" };

type Petak = Extract<Sel, { jenis: "petak" }>;

export function blokDari(denah: Denah, nomor: string) {
  return denah.bloks.find((b) => nomor.startsWith(`KK-${b.prefix}`) || nomor.startsWith(`${b.prefix}-`));
}

export function jenisMakamOf(lokasi: LokasiMitra, id: string) {
  return lokasi.jenisMakam.find((j) => j.id === id)!;
}

export function kavlingOf(denah: Denah, nomor: string): { blok: Blok; kavling: Kavling } | undefined {
  for (const blok of denah.bloks) {
    const kavling = blok.kavling.find((k) => k.nomor === nomor);
    if (kavling) return { blok, kavling };
  }
}

export function petakOf(denah: Denah, nomor: string): { blok: Blok; petak: Petak } | undefined {
  for (const blok of denah.bloks) {
    const petak = semuaPetak(blok).find((p) => p.nomor === nomor);
    if (petak) return { blok, petak };
  }
}

/** "2 Petak · Blok A: A-12, A-13" or "Kavling Keluarga KK-A1 · Blok A (4 petak)". */
export function ringkasan(denah: Denah, pilihan: Pilihan) {
  if (pilihan.jenis === "kosong") return "Belum ada petak dipilih";
  if (pilihan.jenis === "kavling") {
    const found = kavlingOf(denah, pilihan.nomor);
    return `Kavling Keluarga ${pilihan.nomor} · ${found?.blok.nama} (${(found?.kavling.h ?? 0) * (found?.kavling.w ?? 0)} petak)`;
  }
  const perBlok = denah.bloks
    .map((b) => ({ b, list: pilihan.nomor.filter((n) => n.startsWith(`${b.prefix}-`)) }))
    .filter((x) => x.list.length)
    .map((x) => `${x.b.nama}: ${x.list.join(", ")}`);
  return `${pilihan.nomor.length} Petak · ${perBlok.join(" · ")}`;
}

/** The lines of the Terencana headline price: one Harga Hak Pakai per unit. */
export function barisHarga(lokasi: LokasiMitra, denah: Denah, pilihan: Pilihan) {
  if (pilihan.jenis === "kosong") return [];
  if (pilihan.jenis === "kavling") {
    const found = kavlingOf(denah, pilihan.nomor)!;
    const j = jenisMakamOf(lokasi, found.kavling.jenisMakam);
    return [{ label: `Harga Hak Pakai · ${pilihan.nomor}, ${j.nama}`, harga: j.hargaHakPakai }];
  }
  return pilihan.nomor.map((n) => {
    const found = petakOf(denah, n)!;
    const j = jenisMakamOf(lokasi, found.blok.jenisMakam);
    return { label: `Harga Hak Pakai · ${n}, ${j.nama}`, harga: j.hargaHakPakai };
  });
}

type Fokus = { jenis: "petak"; petak: Petak; blok: Blok } | null;

const cellBase = "relative flex items-center justify-center rounded-md text-[10px] leading-none font-semibold tabular-nums transition-colors select-none";

export function DenahPicker({
  lokasi,
  denah,
  pilihan,
  setPilihan,
  diambil,
  pesan,
  setPesan,
  blokAwal,
}: {
  lokasi: LokasiMitra;
  denah: Denah;
  pilihan: Pilihan;
  setPilihan: (p: Pilihan) => void;
  /** Petak taken by someone else while choosing (shown as Dipesan). */
  diambil: string[];
  pesan: string | null;
  setPesan: (m: string | null) => void;
  blokAwal?: string;
}) {
  const [blokId, setBlokId] = useState(blokAwal ?? denah.bloks[0].id);
  const [ukuran, setUkuran] = useState(40);
  const [fokus, setFokus] = useState<Fokus>(null);
  const pinch = useRef<{ d: number; u: number } | null>(null);
  const blok = denah.bloks.find((b) => b.id === blokId) ?? denah.bloks[0];
  const gap = 4;
  const pad = 10;
  const cols = blok.sel[0].length;

  const statusOf = (p: Petak) => (diambil.includes(p.nomor) ? "Dipesan" : p.kavling ? kavlingOf(denah, p.kavling)!.kavling.status : p.status);
  const dipilih = (p: Petak) =>
    pilihan.jenis === "petak" ? pilihan.nomor.includes(p.nomor) : pilihan.jenis === "kavling" ? p.kavling === pilihan.nomor : false;

  function ketuk(p: Petak) {
    setFokus({ jenis: "petak", petak: p, blok });
    const status = statusOf(p);
    if (status !== "Tersedia") return;
    if (p.kavling) {
      if (pilihan.jenis === "kavling" && pilihan.nomor === p.kavling) {
        setPilihan({ jenis: "kosong" });
        return;
      }
      if (pilihan.jenis === "petak") setPesan("Kavling Keluarga dipilih utuh sebagai satu unit, jadi petak yang tadi Anda pilih kami lepas.");
      else setPesan(null);
      setPilihan({ jenis: "kavling", nomor: p.kavling });
      return;
    }
    if (pilihan.jenis === "kavling") {
      setPesan("Petak tidak bisa digabung dengan Kavling Keluarga, jadi kavling yang tadi Anda pilih kami lepas.");
      setPilihan({ jenis: "petak", nomor: [p.nomor] });
      return;
    }
    setPesan(null);
    const now = pilihan.jenis === "petak" ? pilihan.nomor : [];
    const next = now.includes(p.nomor) ? now.filter((n) => n !== p.nomor) : [...now, p.nomor];
    setPilihan(next.length ? { jenis: "petak", nomor: next } : { jenis: "kosong" });
  }

  function cellClass(p: Petak) {
    const status = statusOf(p);
    if (dipilih(p)) return "bg-forest text-primary-foreground";
    if (status === "Tersedia") return "border-2 border-sage bg-card text-foreground hover:bg-brand-soft cursor-pointer";
    if (status === "Dipesan") return "bg-warning-soft text-warning-soft-foreground border border-warning/40";
    if (status === "Terisi") return "bg-neutral-soft text-neutral-soft-foreground";
    return "bg-[repeating-linear-gradient(135deg,var(--muted)_0_4px,var(--border-strong)_4px_6px)] text-muted-foreground";
  }

  const kosong = jumlahTersedia(blok) === 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Blok">
          {denah.bloks.map((b) => {
            const n = jumlahTersedia(b);
            const aktif = b.id === blok.id;
            return (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={aktif}
                onClick={() => {
                  setBlokId(b.id);
                  setFokus(null);
                }}
                className={cn(
                  "inline-flex h-11 shrink-0 flex-col items-start justify-center rounded-xl border px-4 text-left",
                  aktif ? "border-forest bg-forest text-primary-foreground" : "border-border-strong bg-card hover:bg-accent",
                )}
              >
                <span className="text-body leading-tight font-semibold">{b.nama}</span>
                <span className={cn("text-caption leading-tight", aktif ? "text-primary-foreground/80" : "text-muted-foreground")}>
                  {n ? `${n} bisa dipilih` : "tidak ada yang tersedia"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3">
        <p className="text-small text-muted-foreground">
          {blok.nama} · {jenisMakamOf(lokasi, blok.jenisMakam).nama}, Harga Hak Pakai {rupiah(jenisMakamOf(lokasi, blok.jenisMakam).hargaHakPakai)} per petak
          {blok.kavling.some((k) => k.status === "Tersedia") ? ` · Kavling Keluarga ${rupiah(jenisMakamOf(lokasi, "kavling").hargaHakPakai)}` : ""}
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

        {pesan ? (
          <div role="status" className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2.5 text-body text-info-soft-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p className="flex-1">{pesan}</p>
            <button type="button" onClick={() => setPesan(null)} className="text-small font-semibold underline underline-offset-2">
              Oke
            </button>
          </div>
        ) : null}

        {kosong ? (
          <div className="rounded-xl border border-dashed border-border-strong bg-card px-4 py-3 text-body">
            <p className="font-medium text-foreground">Belum ada petak tersedia di {blok.nama}.</p>
            <p className="mt-0.5 text-muted-foreground">
              Semua petak di blok ini sudah terisi atau dipesan.{" "}
              {denah.bloks
                .filter((b) => b.id !== blok.id && jumlahTersedia(b) > 0)
                .map((b, i) => (
                  <span key={b.id}>
                    {i ? " atau " : "Coba "}
                    <button type="button" onClick={() => setBlokId(b.id)} className="font-semibold text-forest underline underline-offset-2">
                      {b.nama} ({jumlahTersedia(b)})
                    </button>
                  </span>
                ))}
              .
            </p>
          </div>
        ) : null}

        <div className="relative rounded-2xl border border-border bg-card">
          <div
            className="max-h-[56vh] overflow-auto overscroll-contain lg:max-h-[34rem]"
            style={{ touchAction: "pan-x pan-y" }}
            onTouchStart={(e) => {
              if (e.touches.length === 2) {
                const [a, b] = [e.touches[0], e.touches[1]];
                pinch.current = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), u: ukuran };
              }
            }}
            onTouchMove={(e) => {
              if (e.touches.length === 2 && pinch.current) {
                const [a, b] = [e.touches[0], e.touches[1]];
                const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
                setUkuran(Math.round(Math.min(64, Math.max(24, (pinch.current.u * d) / pinch.current.d))));
              }
            }}
            onTouchEnd={() => (pinch.current = null)}
          >
            <div className="relative" style={{ padding: pad, width: cols * ukuran + (cols - 1) * gap + pad * 2 }}>
              <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, ${ukuran}px)`, gridAutoRows: `${ukuran}px`, gap }} role="group" aria-label={`Denah ${blok.nama}`}>
                {blok.sel.flat().map((s) => {
                  if (s.jenis === "jalan") return <div key={`${s.r}-${s.c}`} className="rounded-sm bg-highlight/35" aria-hidden />;
                  if (s.jenis === "bukan") return <div key={`${s.r}-${s.c}`} aria-hidden />;
                  const status = statusOf(s);
                  const jenis = s.kavling ? "Kavling Keluarga" : jenisMakamOf(lokasi, blok.jenisMakam).nama;
                  const isFokus = fokus?.petak.nomor === s.nomor;
                  return (
                    <button
                      key={s.nomor}
                      type="button"
                      title={`${s.nomor} · ${jenis}${s.kavling ? ` ${s.kavling}` : ""} · ${status}`}
                      aria-label={`${s.nomor}, ${jenis}, ${dipilih(s) ? "dipilih" : status}`}
                      aria-pressed={dipilih(s)}
                      onClick={() => ketuk(s)}
                      className={cn(cellBase, cellClass(s), isFokus && "ring-2 ring-info ring-offset-2 ring-offset-card")}
                    >
                      {dipilih(s) ? <Check className="size-3.5" aria-hidden /> : s.nomor.split("-")[1]}
                    </button>
                  );
                })}
              </div>
              {blok.kavling.map((k) => (
                <div
                  key={k.nomor}
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute rounded-lg border-2 border-dashed",
                    pilihan.jenis === "kavling" && pilihan.nomor === k.nomor ? "border-forest" : "border-sage-strong",
                  )}
                  style={{
                    left: pad + k.c * (ukuran + gap) - 4,
                    top: pad + k.r * (ukuran + gap) - 4,
                    width: k.w * ukuran + (k.w - 1) * gap + 8,
                    height: k.h * ukuran + (k.h - 1) * gap + 8,
                  }}
                >
                  <span className="absolute -top-2.5 left-1.5 rounded bg-card px-1 text-[10px] leading-tight font-semibold text-sage-strong">{k.nomor}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="text-small text-muted-foreground lg:hidden">Geser untuk melihat seluruh blok; cubit atau pakai tombol +/− untuk memperbesar.</p>
      </div>

      <aside className="flex flex-col gap-4">
        <div className="hidden lg:block">
          <Detail lokasi={lokasi} denah={denah} fokus={fokus} statusOf={statusOf} dipilih={dipilih} />
        </div>
        {/* Phone: the tapped cell's detail floats just above the total bar. */}
        {fokus ? (
          <div className="fixed inset-x-3 bottom-[5.75rem] z-20 lg:hidden">
            <div className="relative shadow-lg">
              <Detail lokasi={lokasi} denah={denah} fokus={fokus} statusOf={statusOf} dipilih={dipilih} />
              <button type="button" onClick={() => setFokus(null)} aria-label="Tutup detail" className="absolute top-2 right-2 inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent">
                <X className="size-4" />
              </button>
            </div>
          </div>
        ) : null}
        <details className="group rounded-2xl border border-border bg-card p-4 lg:open:pb-4" open>
          <summary className="cursor-pointer text-title-3 text-foreground marker:text-muted-foreground">Keterangan</summary>
          <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 text-small lg:grid-cols-1">
            <Legend swatch="border-2 border-sage bg-card" label="Tersedia, bisa dipilih" />
            <Legend swatch="bg-forest" label="Pilihan Anda" />
            <Legend swatch="bg-warning-soft border border-warning/40" label="Dipesan" />
            <Legend swatch="bg-neutral-soft" label="Terisi" />
            <Legend swatch="bg-[repeating-linear-gradient(135deg,var(--muted)_0_4px,var(--border-strong)_4px_6px)]" label="Tidak Tersedia" />
            <Legend swatch="border-2 border-dashed border-sage-strong" label="Kavling Keluarga (satu unit)" />
            <Legend swatch="bg-highlight/35" label="Jalan" />
            <Legend swatch="border border-dashed border-border" label="Bukan petak (pohon, bangunan)" />
          </ul>
        </details>
      </aside>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <li className="flex items-center gap-2 text-foreground">
      <span className={cn("size-4 shrink-0 rounded", swatch)} aria-hidden />
      {label}
    </li>
  );
}

function Detail({
  lokasi,
  denah,
  fokus,
  statusOf,
  dipilih,
}: {
  lokasi: LokasiMitra;
  denah: Denah;
  fokus: Fokus;
  statusOf: (p: Petak) => string;
  dipilih: (p: Petak) => boolean;
}) {
  if (!fokus) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-body text-muted-foreground">
        Ketuk petak untuk melihat Nomor Makam dan Jenis Makam-nya. Anda bisa memilih satu atau beberapa petak, atau satu Kavling Keluarga utuh.
      </div>
    );
  }
  const p = fokus.petak;
  const status = statusOf(p);
  const kav = p.kavling ? kavlingOf(denah, p.kavling) : undefined;
  const j = jenisMakamOf(lokasi, kav ? kav.kavling.jenisMakam : fokus.blok.jenisMakam);
  const isiKavling = kav ? semuaPetak(kav.blok).filter((x) => x.kavling === kav.kavling.nomor).map((x) => x.nomor) : [];

  let body: React.ReactNode;
  if (status === "Tersedia") {
    body = (
      <p className="text-body text-foreground">
        Harga Hak Pakai {rupiah(j.hargaHakPakai)} · {j.masaHakPakai.toLowerCase() === "selamanya" ? "selamanya" : j.masaHakPakai}.{" "}
        {dipilih(p) ? "Sudah Anda pilih; ketuk lagi untuk membatalkan." : "Ketuk untuk memilih."}
      </p>
    );
  } else if (status === "Dipesan") {
    body = <p className="text-body text-foreground">{kav ? "Kavling ini" : "Petak ini"} sedang dipesan keluarga lain, jadi tidak bisa dipilih.</p>;
  } else if (status === "Terisi" && p.tumpangSaja) {
    body = (
      <div className="flex flex-col gap-2 text-body text-foreground">
        <p>Petak ini sudah terisi dan hanya bisa dipakai untuk tumpang (pemakaman di makam yang sudah ada). Pengaturannya lewat Admin Lokasi.</p>
        <a href={`tel:${lokasi.kontakSiaga.telepon.replace(/-/g, "")}`} className="inline-flex items-center gap-1.5 font-semibold text-forest">
          <Phone className="size-4" aria-hidden /> Hubungi Admin Lokasi: {lokasi.kontakSiaga.nama}, {lokasi.kontakSiaga.telepon}
        </a>
      </div>
    );
  } else if (status === "Terisi") {
    body = <p className="text-body text-foreground">Sudah ada pemakaman di petak ini, jadi tidak bisa dipilih.</p>;
  } else {
    body = <p className="text-body text-foreground">Petak ini sedang tidak dijual oleh lokasi, jadi tidak bisa dipilih.</p>;
  }

  return (
    <div className={cn("flex flex-col gap-2 rounded-2xl border p-4", status === "Tersedia" ? "border-forest bg-card" : "border-border bg-card")}>
      <div className="flex items-start justify-between gap-3 pr-8 lg:pr-0">
        <div>
          <p className="font-mono text-title-2 text-foreground">{kav ? kav.kavling.nomor : p.nomor}</p>
          <p className="text-small text-muted-foreground">
            {kav ? `${j.nama} · petak ${isiKavling.join(", ")}` : `${j.nama} · ${fokus.blok.nama}`}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-caption font-semibold",
            status === "Tersedia" ? "bg-success-soft text-success-soft-foreground" : status === "Dipesan" ? "bg-warning-soft text-warning-soft-foreground" : "bg-neutral-soft text-neutral-soft-foreground",
          )}
        >
          {dipilih(p) ? "Dipilih" : status}
        </span>
      </div>
      {body}
    </div>
  );
}
