"use client";

/*
 * PROTOTYPE, throwaway. The public site's frame: top bar, phone drawer,
 * footer, the floating CS button, the "Segera hadir" dialog and the floating
 * prototype bar (screens + Rilis 1 / semua rilis).
 */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createContext, Suspense, useContext, useEffect, useState } from "react";
import { ChevronLeft, Clock, Menu, MessageCircle, X } from "lucide-react";
import { BrandMark } from "@/components/makam/brand-logo";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { BASE, CS } from "../_mock/data";

type Pratinjau = {
  /** false = Rilis 1 (go-live): only Lokasi Mitra Saat Duka and Terencana are live. */
  semuaRilis: boolean;
  setSemuaRilis: (v: boolean) => void;
  segera: (label: string) => void;
};

const PratinjauContext = createContext<Pratinjau>({ semuaRilis: false, setSemuaRilis: () => {}, segera: () => {} });
export const usePratinjau = () => useContext(PratinjauContext);

type NavItem = { label: string; href: string; rilis1: boolean };

export const NAV: NavItem[] = [
  { label: "Pesan Makam", href: `${BASE}/pesan`, rilis1: true },
  { label: "Makam Keluarga", href: `${BASE}#makam-keluarga`, rilis1: false },
  { label: "Layanan", href: `${BASE}#layanan`, rilis1: false },
  { label: "Wakaf Tanah", href: `${BASE}#wakaf`, rilis1: false },
  { label: "Daftar Lokasi", href: `${BASE}/lokasi`, rilis1: true },
];

export function Wordmark({ onForest = false }: { onForest?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <BrandMark className="h-8" />
      <span className={cn("text-small font-bold tracking-[0.04em]", onForest ? "text-ivory" : "text-forest")}>MAKAM.CO.ID</span>
    </span>
  );
}

function NavLink({ item, className, onNavigate }: { item: NavItem; className?: string; onNavigate?: () => void }) {
  const { semuaRilis, segera } = usePratinjau();
  const pathname = usePathname();
  const active = item.href.startsWith(`${BASE}/`) && pathname.startsWith(item.href);
  if (!item.rilis1 && !semuaRilis) {
    return (
      <button
        type="button"
        onClick={() => {
          onNavigate?.();
          segera(item.label);
        }}
        className={cn(className, "text-muted-foreground")}
      >
        {item.label}
        <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-caption font-medium text-muted-foreground">Segera</span>
      </button>
    );
  }
  return (
    <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn(className, active && "text-forest font-semibold")}>
      {item.label}
    </Link>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/85">
      <div className="mx-auto flex h-16 max-w-[80rem] items-center justify-between gap-6 px-4 md:px-8">
        <Link href={BASE} aria-label="Makam.co.id, ke Beranda">
          <Wordmark />
        </Link>
        <nav aria-label="Menu utama" className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <NavLink
              key={item.label}
              item={item}
              className="inline-flex h-10 items-center rounded-lg px-3 text-body font-medium text-foreground transition-colors hover:bg-accent"
            />
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href={`${BASE}#masuk`}
            className="hidden h-10 items-center rounded-lg border border-border-strong px-4 text-body font-semibold text-forest transition-colors hover:bg-accent lg:inline-flex"
          >
            Masuk
          </Link>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={
                <button type="button" aria-label="Buka menu" className="inline-flex size-11 items-center justify-center rounded-lg text-forest hover:bg-accent lg:hidden" />
              }
            >
              <Menu className="size-6" />
            </SheetTrigger>
            <SheetContent side="right" className="w-[86%] max-w-sm gap-0 bg-background p-0" showCloseButton={false}>
              <div className="flex h-16 items-center justify-between border-b border-border px-4">
                <SheetTitle className="sr-only">Menu</SheetTitle>
                <Wordmark />
                <button type="button" onClick={() => setOpen(false)} aria-label="Tutup menu" className="inline-flex size-11 items-center justify-center rounded-lg text-forest hover:bg-accent">
                  <X className="size-6" />
                </button>
              </div>
              <nav aria-label="Menu utama" className="flex flex-col p-2">
                {NAV.map((item) => (
                  <NavLink
                    key={item.label}
                    item={item}
                    onNavigate={() => setOpen(false)}
                    className="flex min-h-12 items-center rounded-lg px-4 text-left text-body-lg font-medium text-foreground hover:bg-accent"
                  />
                ))}
              </nav>
              <div className="mt-auto flex flex-col gap-3 border-t border-border p-4">
                <Link href={`${BASE}#masuk`} onClick={() => setOpen(false)} className="inline-flex h-12 items-center justify-center rounded-lg border border-border-strong text-body-lg font-semibold text-forest">
                  Masuk
                </Link>
                <a href={CS.waLink} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 text-body text-muted-foreground">
                  <MessageCircle className="size-4" /> Butuh bantuan? WhatsApp CS
                </a>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

/** The wizard keeps only the logo, a way out and the CS link: nothing to wander off to. */
function WizardHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4">
        <Link href={BASE} aria-label="Keluar dari pemesanan, ke Beranda">
          <Wordmark />
        </Link>
        <a href={CS.waLink} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-small font-medium text-forest hover:bg-accent">
          <MessageCircle className="size-4" />
          <span>Tanya CS</span>
        </a>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-muted/50">
      <div className="mx-auto grid max-w-[80rem] gap-8 px-4 py-10 md:grid-cols-[1.4fr_1fr_1fr] md:px-8">
        <div className="flex flex-col gap-3">
          <Wordmark />
          <p className="max-w-sm text-small text-muted-foreground">Menemani keluarga, menjaga kenangan. Kami bekerja sama dengan Lokasi Mitra yang sudah terverifikasi.</p>
        </div>
        <nav aria-label="Tentang" className="flex flex-col gap-2 text-small">
          <span className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Tentang</span>
          {["Tentang Kami", "Cara Kami Bekerja", "FAQ", "Hubungi Kami"].map((t) => (
            <a key={t} href={`${BASE}#${t.toLowerCase().replace(/ /g, "-")}`} className="text-foreground hover:text-forest">
              {t}
            </a>
          ))}
        </nav>
        <div className="flex flex-col gap-2 text-small">
          <span className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Bantuan</span>
          <a href={CS.waLink} target="_blank" rel="noreferrer" className="font-medium text-forest">
            WhatsApp CS {CS.phone}
          </a>
          <span className="text-muted-foreground">Dibalas {CS.hours}</span>
        </div>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-[80rem] px-4 py-4 text-caption text-muted-foreground md:px-8">Makam.co.id dikelola oleh PT Jaya Korpora Prima</p>
      </div>
    </footer>
  );
}

function CsButton({ raised }: { raised: boolean }) {
  return (
    <a
      href={CS.waLink}
      target="_blank"
      rel="noreferrer"
      aria-label="Tanya CS lewat WhatsApp"
      className={cn(
        "fixed right-4 z-30 inline-flex h-12 items-center gap-2 rounded-full bg-primary px-4 text-body font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 md:right-8",
        raised ? "bottom-24 lg:bottom-8" : "bottom-4 md:bottom-8",
      )}
    >
      <MessageCircle className="size-5" />
      <span className="hidden sm:inline">Tanya CS</span>
    </a>
  );
}

function SegeraDialog({ label, onClose }: { label: string | null; onClose: () => void }) {
  if (!label) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-overlay p-4 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="segera-title"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <span className="inline-flex size-10 items-center justify-center rounded-full bg-brand-soft text-forest">
            <Clock className="size-5" />
          </span>
          <button type="button" onClick={onClose} aria-label="Tutup" className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-accent">
            <X className="size-5" />
          </button>
        </div>
        <h2 id="segera-title" className="mt-4 text-title-2 text-forest">
          {label}: segera hadir
        </h2>
        <p className="mt-2 text-body text-muted-foreground">
          Layanan ini sedang kami siapkan dan belum bisa dipesan di sini. Jika Anda membutuhkannya sekarang, tim CS kami siap membantu dan
          mengarahkan langkah yang tepat.
        </p>
        <a
          href={CS.waLink}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-body font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <MessageCircle className="size-4" /> Tanya CS lewat WhatsApp
        </a>
        <p className="mt-2 text-center text-caption text-muted-foreground">
          {CS.phone} · dibalas {CS.hours}
        </p>
      </div>
    </div>
  );
}

const SCREENS = [
  { label: "Beranda", href: BASE },
  { label: "Daftar Lokasi", href: `${BASE}/lokasi` },
  { label: "Lokasi Mitra", href: `${BASE}/lokasi/taman-makam-firdaus` },
  { label: "Pilih makam", href: `${BASE}/pesan` },
  { label: "Data & kirim", href: `${BASE}/pesan?langkah=data&pilihan=taman-makam-firdaus.standar` },
];

function PrototypeBar() {
  const params = useSearchParams();
  const { semuaRilis, setSemuaRilis } = usePratinjau();
  const [open, setOpen] = useState(true);
  if (params.get("bar") === "0") return null;
  return (
    <div className="fixed bottom-4 left-4 z-50 print:hidden" data-pratinjau-bar>
      {open ? (
        <div className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-1 rounded-2xl border border-charcoal bg-charcoal p-1.5 text-caption text-ivory shadow-lg">
          <span className="px-2 font-semibold uppercase tracking-wide text-sand">Pratinjau</span>
          {SCREENS.map((s) => (
            <Link key={s.label} href={s.href} className="rounded-lg px-2 py-1 hover:bg-ivory/15">
              {s.label}
            </Link>
          ))}
          <button type="button" onClick={() => setSemuaRilis(!semuaRilis)} className="rounded-lg bg-ivory/15 px-2 py-1 font-medium hover:bg-ivory/25">
            {semuaRilis ? "Semua rilis" : "Rilis 1"}
          </button>
          <button type="button" onClick={() => setOpen(false)} aria-label="Sembunyikan" className="rounded-lg px-1.5 py-1 hover:bg-ivory/15">
            <ChevronLeft className="size-4" />
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="rounded-full bg-charcoal px-3 py-1.5 text-caption font-semibold text-sand shadow-lg">
          Pratinjau
        </button>
      )}
    </div>
  );
}

const STORAGE_KEY = "pratinjau-publik-semua-rilis";

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const inWizard = pathname.startsWith(`${BASE}/pesan`);
  const [semuaRilis, setSemua] = useState(false);
  const [segeraLabel, setSegeraLabel] = useState<string | null>(null);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- prototype: read the stored toggle once after hydration
      if (localStorage.getItem(STORAGE_KEY) === "1") setSemua(true);
    } catch {}
  }, []);

  const setSemuaRilis = (v: boolean) => {
    setSemua(v);
    try {
      localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {}
  };

  return (
    <PratinjauContext.Provider value={{ semuaRilis, setSemuaRilis, segera: setSegeraLabel }}>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        {inWizard ? <WizardHeader /> : <Header />}
        <main className="flex flex-1 flex-col">{children}</main>
        {inWizard ? null : <Footer />}
        {inWizard ? null : <CsButton raised={/\/lokasi\/[^/]+$/.test(pathname)} />}
        <SegeraDialog label={segeraLabel} onClose={() => setSegeraLabel(null)} />
        <Suspense fallback={null}>
          <PrototypeBar />
        </Suspense>
      </div>
    </PratinjauContext.Provider>
  );
}
