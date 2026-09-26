import { readFileSync } from "node:fs";
import path from "node:path";
import { PageHeader } from "@/components/makam/page-header";
import { BrandLogo } from "../_shell/brand-mark";
import { StatCard } from "@/components/makam/stat-card";
import { StatusBadge, statusVocabulary, type StatusKey } from "@/components/makam/status-badge";
import { ButtonsDemo, ConfirmDialogDemo, DataTableDemo, FormSectionDemo, StatesDemo, SwitchersDemo } from "./demos";

/**
 * PROTOTYPE (f): the design system catalogue. Colour values are read from
 * globals.css at request time, so this page cannot drift from the tokens.
 */

function tokens() {
  const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
  const block = (selector: string) => {
    const start = css.indexOf(`\n${selector} {`);
    return css.slice(start, css.indexOf("\n}", start));
  };
  const parse = (text: string) => Object.fromEntries([...text.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  const light = parse(block(":root"));
  const dark = { ...light, ...parse(block(".dark")) };
  const resolve = (map: Record<string, string>, name: string) => {
    let value = map[name];
    while (value?.startsWith("var(--")) value = map[value.slice(6, -1)];
    return value ?? "";
  };
  return { light: (name: string) => resolve(light, name), dark: (name: string) => resolve(dark, name) };
}

const colourGroups: { title: string; note: string; names: string[] }[] = [
  {
    title: "Palet merek",
    note: "Lima warna dari Brand Guideline 2026, persis. Token peran di bawah menunjuk ke sini; komponen memakai token peran.",
    names: ["forest", "sage", "sand", "ivory", "charcoal"],
  },
  { title: "Permukaan", note: "Latar Ivory, kartu putih gading hangat (#FCFAF5), bukan putih murni. Netral hangat kehijauan, bukan abu-abu polos.", names: ["background", "card", "subtle", "muted", "sidebar", "popover"] },
  { title: "Teks dan garis", note: "Teks Charcoal, teks pendukung (≥ 4,5:1 di semua permukaan), garis dan fokus (Forest).", names: ["foreground", "muted-foreground", "border", "border-strong", "input", "ring"] },
  {
    title: "Peran merek",
    note: "Forest untuk aksi utama, menu aktif dan fokus. Sage untuk elemen pendukung; sage-strong bila Sage dipakai sebagai teks. Sand hemat, hanya untuk sorotan.",
    names: ["primary", "primary-foreground", "brand-soft", "brand-soft-foreground", "secondary", "secondary-foreground", "sage-strong", "accent", "highlight", "highlight-foreground"],
  },
  {
    title: "Semantik",
    note: "Diredam agar tenang bersama palet merek. Isi (solid) untuk titik, ikon dan bilah; soft untuk latar lencana dan banner dengan teks -soft-foreground.",
    names: ["success", "success-soft", "success-soft-foreground", "warning", "warning-soft", "warning-soft-foreground", "danger", "danger-soft", "danger-soft-foreground", "info", "info-soft", "info-soft-foreground", "neutral-soft", "neutral-soft-foreground"],
  },
  {
    title: "Bilah tenggat Antrean",
    note: "Sage → Sand/amber → merah redam seiring jendela terpakai; merah penuh hanya setelah Terlambat.",
    names: ["deadline-calm", "deadline-soon", "deadline-near", "deadline-late"],
  },
];

const voiceRules = [
  { title: "Tanpa hard-selling", body: "Tidak mendesak, tidak memburu. Tawarkan langkah berikutnya, bukan tekanan." },
  { title: "Tanpa klaim yang belum pasti", body: "Katakan yang sudah dipastikan. “Ketersediaan akhir dikonfirmasi sebelum pesanan difinalisasi.”" },
  { title: "Jelaskan status dan batasan", body: "Setiap status bilang artinya dan langkah berikutnya; batas waktu disebut dengan jelas." },
  { title: "Jaga privasi", body: "Dokumen keluarga tidak pernah dipamerkan; tampilkan seperlunya untuk pekerjaan." },
];

const typeScale = [
  { cls: "text-display", name: "display", spec: "30/36, 600, -0.02em", use: "Angka di StatCard" },
  { cls: "text-title-1", name: "title-1", spec: "24/32, 600, -0.015em", use: "Judul halaman (satu h1)" },
  { cls: "text-title-2", name: "title-2", spec: "18/26, 600, -0.008em", use: "Judul bagian" },
  { cls: "text-title-3", name: "title-3", spec: "15/22, 600, -0.003em", use: "Judul panel, kartu, dialog" },
  { cls: "text-body-lg", name: "body-lg", spec: "16/24, 400", use: "Isian di ponsel, teks panjang" },
  { cls: "text-body", name: "body", spec: "14/20, 400", use: "Teks dasar Area Staf" },
  { cls: "text-small", name: "small", spec: "13/18, 400, 0.003em", use: "Keterangan, meta, sel tabel sekunder" },
  { cls: "text-caption", name: "caption", spec: "12/16, 400–500, 0.01em", use: "Lencana, kepala tabel, jam" },
];

const spacing = [1, 2, 3, 4, 5, 6, 8, 10, 12];
const radii = [
  { cls: "rounded-sm", name: "sm", px: "6px", use: "Kbd, chip kecil" },
  { cls: "rounded-md", name: "md", px: "8px", use: "Lencana, item menu" },
  { cls: "rounded-lg", name: "lg", px: "10px", use: "Tombol, isian" },
  { cls: "rounded-xl", name: "xl", px: "12px", use: "Kartu, tabel, dialog, popover" },
  { cls: "rounded-full", name: "full", px: "∞", use: "Avatar, titik status" },
];
const shadows = [
  { cls: "shadow-xs", name: "xs", use: "Kartu dan tabel (bersama garis), segmen aktif" },
  { cls: "shadow-sm", name: "sm", use: "Jarang" },
  { cls: "shadow-md", name: "md", use: "Popover, menu" },
  { cls: "shadow-lg", name: "lg", use: "Dialog, sheet" },
];

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-judul`} className="flex scroll-mt-20 flex-col gap-4">
      <div className="flex flex-col gap-1 border-b border-border pb-3">
        <h2 id={`${id}-judul`} className="text-title-2">
          {title}
        </h2>
        {description ? <p className="max-w-prose text-small text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** oklch(L C H) to #rrggbb, so the catalogue shows both forms. Alpha values stay as written. */
function toHex(value: string) {
  if (value.startsWith("#")) return value.toUpperCase();
  const m = value.match(/^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/);
  if (!m) return null;
  const [L, C, H] = [Number(m[1]), Number(m[2]), (Number(m[3]) * Math.PI) / 180];
  const a = C * Math.cos(H);
  const b = C * Math.sin(H);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ];
  const channel = (c: number) => {
    const v = Math.min(1, Math.max(0, c));
    const srgb = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, srgb)) * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${linear.map(channel).join("")}`.toUpperCase();
}

function Swatch({ value, surface }: { value: string; surface: string }) {
  const hex = toHex(value);
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md" style={{ background: surface }}>
        <span className="size-7 rounded-[5px] ring-1 ring-black/10 ring-inset" style={{ background: value }} />
      </span>
      <span className="flex min-w-0 flex-col">
        {hex && hex !== value.toUpperCase() ? <code className="font-mono text-caption text-foreground">{hex}</code> : null}
        <code className="truncate font-mono text-[0.6875rem] text-muted-foreground">{value}</code>
      </span>
    </div>
  );
}

export default function KatalogPratinjau() {
  const t = tokens();
  const statuses = Object.keys(statusVocabulary) as StatusKey[];
  return (
    <>
      <PageHeader
        title="Katalog design system"
        description="Token, skala dan komponen makam dalam satu halaman. Sumber kebenarannya globals.css dan src/components/makam; dokumentasinya docs/design-system.md."
      />

      <nav aria-label="Isi katalog" className="-mt-4 flex flex-wrap gap-x-4 gap-y-1 text-small">
        {["merek", "warna", "tipografi", "spasi", "radius", "bayangan", "status", "komponen", "keadaan"].map((id) => (
          <a key={id} href={`#${id}`} className="font-medium text-brand underline-offset-4 hover:underline">
            {id[0].toUpperCase() + id.slice(1)}
          </a>
        ))}
      </nav>

      <Section
        id="merek"
        title="Merek"
        description="Sumber utama: MAKAM.CO.ID Brand Guideline (Visual 2026), docs/brand/brand-guideline-visual-2026.pdf. Rasa yang dijaga: tenang, hangat, jelas."
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-card shadow-xs p-6">
            <h3 className="text-title-3">Logo sementara</h3>
            <BrandLogo caption="Area Staf" className="[&_img]:h-12" />
            <p className="text-small text-muted-foreground">
              Wordmark MAKAM.CO.ID (Plus Jakarta Sans tebal) di samping tanda konseptual dari panduan merek, diperkecil. Diganti master
              vektor (SVG) dari desainer merek, beserta versi satu warna dan ikon kecil.
            </p>
          </div>
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-card shadow-xs p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-title-3">Suara: hangat, jelas, tidak menghakimi</h3>
              <p className="rounded-md bg-highlight px-2 py-0.5 text-caption font-semibold tracking-[0.06em] text-highlight-foreground">DIBANTU · JELAS · AMAN</p>
            </div>
            <ul className="grid gap-3 text-small sm:grid-cols-2">
              {voiceRules.map((rule) => (
                <li key={rule.title} className="flex flex-col gap-0.5">
                  <span className="font-semibold text-foreground">{rule.title}</span>
                  <span className="text-muted-foreground">{rule.body}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section id="warna" title="Warna" description="Setiap token punya nilai terang dan gelap. Komponen memakai nama semantik, tidak pernah warna mentah.">
        <div className="flex flex-col gap-8">
          {colourGroups.map((group) => (
            <div key={group.title} className="flex flex-col gap-3">
              <div>
                <h3 className="text-title-3">{group.title}</h3>
                <p className="text-small text-muted-foreground">{group.note}</p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
                <table className="w-full min-w-[40rem] table-fixed text-small">
                  <colgroup>
                    <col className="w-64" />
                    <col />
                    <col />
                  </colgroup>
                  <thead className="bg-subtle text-caption text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Token</th>
                      <th className="px-4 py-2 text-left font-medium">Terang</th>
                      <th className="px-4 py-2 text-left font-medium">Gelap</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {group.names.map((name) => (
                      <tr key={name}>
                        <td className="px-4 py-2 font-mono text-caption">--{name}</td>
                        <td className="px-4 py-2">
                          <Swatch value={t.light(name)} surface={t.light("background")} />
                        </td>
                        <td className="px-4 py-2">
                          <Swatch value={t.dark(name)} surface={t.dark("background")} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="tipografi" title="Tipografi" description="Plus Jakarta Sans untuk semua UI. Geist Mono hanya untuk kode yang disalin atau dibacakan orang (Nomor Pemesanan, nomor rekening). Angka di tabel memakai tabular-nums. Lora hanya untuk judul emosional di situs publik, tidak pernah di Area Staf.">
        <ul className="divide-y divide-border rounded-xl border border-border bg-card shadow-xs">
          {typeScale.map((item) => (
            <li key={item.name} className="grid items-baseline gap-2 px-5 py-4 md:grid-cols-[9rem_minmax(0,1fr)_14rem]">
              <code className="font-mono text-caption text-muted-foreground">{item.name}</code>
              <p className={item.cls}>Taman Makam Wakaf Al-Ikhlas</p>
              <p className="text-caption text-muted-foreground">
                {item.spec}. {item.use}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <div className="grid gap-(--section-gap) lg:grid-cols-2">
        <Section id="spasi" title="Spasi" description="Kelipatan 4px dari Tailwind. Celah antarbagian halaman 32px, di dalam panel 16–20px.">
          <ul className="flex flex-col gap-2">
            {spacing.map((step) => (
              <li key={step} className="grid grid-cols-[5rem_3rem_minmax(0,1fr)] items-center gap-3 text-small">
                <code className="font-mono text-caption">--space-{step}</code>
                <span className="text-muted-foreground tabular-nums">{step * 4}px</span>
                <span className="h-3 rounded-sm bg-brand/70" style={{ width: `${step * 4}px` }} />
              </li>
            ))}
          </ul>
        </Section>

        <Section id="radius" title="Radius" description="Satu dasar (--radius: 10px), turunan untuk hierarki. Sesuai merek: kartu dan dialog lembut membulat (12px), kontrol 10px.">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {radii.map((item) => (
              <li key={item.name} className="flex flex-col gap-2">
                <span className={`h-14 border border-border-strong bg-muted ${item.cls}`} />
                <span className="text-small">
                  <code className="font-mono text-caption">{item.name}</code> <span className="text-muted-foreground">{item.px}</span>
                </span>
                <span className="text-caption text-muted-foreground">{item.use}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section id="bayangan" title="Bayangan dan gerak" description="Bayangan menandai ketinggian (menu, dialog), bukan hiasan. Gerak hanya menjawab aksi: 140ms untuk hover dan tekan, 200ms untuk membuka, 320ms untuk sheet. prefers-reduced-motion mematikannya.">
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {shadows.map((item) => (
            <li key={item.name} className="flex flex-col gap-2">
              <span className={`h-16 rounded-xl bg-card ${item.cls}`} />
              <span className="text-small">
                <code className="font-mono text-caption">shadow-{item.name}</code>
              </span>
              <span className="text-caption text-muted-foreground">{item.use}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="status" title="StatusBadge" description="Satu kosakata untuk semua status domain. Nada membawa makna: hijau beres, kuning perlu perhatian, merah lewat tenggat, biru menunggu orang lain, netral belum mulai atau sudah berakhir. Tidak ada lencana “Verified Partner”: Terverifikasi adalah syarat tayang, bukan lencana.">
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
          <table className="w-full min-w-[32rem] text-small">
            <thead className="bg-subtle text-caption text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Lencana</th>
                <th className="px-4 py-2 text-left font-medium">Kunci</th>
                <th className="px-4 py-2 text-left font-medium">Nada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {statuses.map((key) => (
                <tr key={key}>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={key} />
                  </td>
                  <td className="px-4 py-2.5 font-mono text-caption">{key}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{statusVocabulary[key].tone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="komponen" title="Komponen makam" description="Komposisi di src/components/makam, dibangun dari primitif shadcn.">
        <div className="flex flex-col gap-8">
          <Demo name="PageHeader">
            <div className="rounded-xl border border-dashed border-border-strong p-5">
              <PageHeader title="Lokasi Mitra" status={<StatusBadge status="terverifikasi" />} description="Satu h1, status di sampingnya, aksi di kanan." />
            </div>
          </Demo>
          <Demo name="StatCard">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard label="Lokasi Mitra aktif" value={9} note="3 Belum Tayang" />
              <StatCard label="Antrean hari ini" value={17} note="2 lewat tenggat dalam 1 jam" attention="warning" />
              <StatCard label="Tagihan lewat jatuh tempo" value={4} note="Rp 18.450.000 belum dibayar" attention="danger" />
            </div>
          </Demo>
          <Demo name="DataTable">
            <DataTableDemo />
          </Demo>
          <Demo name="FormSection">
            <FormSectionDemo />
          </Demo>
          <Demo name="ConfirmDialog">
            <ConfirmDialogDemo />
          </Demo>
          <Demo name="RoleSwitcher, LokasiSwitcher, ThemeToggle">
            <SwitchersDemo />
          </Demo>
          <Demo name="Button (primitif shadcn)">
            <ButtonsDemo />
          </Demo>
        </div>
      </Section>

      <Section id="keadaan" title="Keadaan kosong, memuat dan galat" description="Seragam di semua halaman: kosong mengajak bertindak, memuat memakai kerangka seukuran isinya, galat bilang apa yang terjadi dan cara mencoba lagi.">
        <StatesDemo />
      </Section>
    </>
  );
}

function Demo({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-mono text-small text-muted-foreground">{name}</h3>
      {children}
    </div>
  );
}
