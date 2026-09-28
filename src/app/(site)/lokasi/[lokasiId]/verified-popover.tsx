"use client";

/**
 * "Terverifikasi Makam.co.id · dikunjungi …" with its "apa yang kami periksa?"
 * popover (public-site prototype, 1:1). The four checks are the publish gate
 * (`src/domain/lokasi/publish-gate.ts`) in the family's own words: every
 * Lokasi Mitra shown here passed all five of its items (Jam Operasional and
 * Kontak Siaga share one line), so nothing here is a promise beyond what
 * already got this Lokasi Mitra onto the page.
 */
import { useEffect, useRef, useState } from "react";
import { BadgeCheck, ChevronDown, X } from "lucide-react";

const CHECKS = [
  "Perjanjian kerja sama dengan pengelola sudah ditandatangani.",
  "Petugas Lapangan kami datang ke lokasi: memastikan alamat dan titik peta, memotret lokasi, dan memeriksa fasilitas.",
  "Jenis Makam dan tarifnya sudah dimasukkan dan diperiksa tim kami.",
  "Jam Operasional dan Kontak Siaga lokasi sudah tercatat.",
];

export function VerifiedPopover({ dikunjungi }: { dikunjungi: string | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative self-start">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="yang-kami-periksa"
        className="inline-flex min-h-10 items-center gap-2 rounded-full bg-success-soft px-3.5 py-1.5 text-left text-body font-medium text-success-soft-foreground hover:bg-success-soft/80"
      >
        <BadgeCheck className="size-4 shrink-0" aria-hidden />
        {dikunjungi ? `Terverifikasi Makam.co.id · dikunjungi ${dikunjungi}` : "Terverifikasi Makam.co.id"}
        <ChevronDown className={open ? "size-4 rotate-180 transition-transform" : "size-4 transition-transform"} aria-hidden />
      </button>
      {open ? (
        <div
          id="yang-kami-periksa"
          role="dialog"
          aria-label="Yang kami periksa"
          className="absolute top-full left-0 z-20 mt-2 w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-border bg-popover p-5 shadow-md"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-title-3 text-foreground">Yang kami periksa</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Tutup"
              className="-m-1 inline-flex size-8 items-center justify-center rounded-lg hover:bg-accent"
            >
              <X className="size-4" />
            </button>
          </div>
          <ul className="mt-3 flex flex-col gap-2.5">
            {CHECKS.map((c) => (
              <li key={c} className="flex items-start gap-2 text-body text-foreground">
                <BadgeCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {c}
              </li>
            ))}
          </ul>
          {dikunjungi ? (
            <p className="mt-3 text-small text-muted-foreground">
              Kunjungan terakhir {dikunjungi}. Kami bisa mengunjungi ulang kapan saja; tanggal di atas ikut diperbarui.
            </p>
          ) : null}
          <a href="/cara-kami-bekerja" className="mt-3 inline-block text-small font-semibold text-forest">
            Cara Kami Bekerja
          </a>
        </div>
      ) : null}
    </div>
  );
}
