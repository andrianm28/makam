# Makam.co.id design system (v1, brand-aligned prototype)

The single source of truth for the staff area, the public site, PDF documents (Tagihan, Bukti) and email. Tokens live in `src/app/globals.css`, compositions in `src/components/makam/`, shadcn primitives in `src/components/ui/`. The live catalogue is `/pratinjau/staf/katalog`; it reads its colour values from `globals.css` at request time and shows each one as hex and oklch, so it can't drift from the tokens. In development only.

Status: restyled to the official brand guideline (spec, "Staff UI and design system", decided 2026-09-26). The prototype under `src/app/(pratinjau)/pratinjau/staf/` is still throwaway. Open questions are at the end.

## Brand source

The primary source is the official **MAKAM.CO.ID Brand Guideline (Visual 2026)**, `docs/brand/brand-guideline-visual-2026.pdf` (18 pages). It overrides every earlier prototype choice: the "Kamboja" sage-teal accent, Geist sans and the frangipani placeholder logo are gone. What this system takes from it:

| Guideline page | What we use |
|---|---|
| 2, 5, 18 Essence, personality, north star | Calm, warm, respectful, trusted, modern. North star: every touchpoint makes people feel **Dibantu, Jelas, Aman**. |
| 6 Logo concept | The conceptual mark (infinity + path + pin + leaves), as an interim raster (see Logo). |
| 7 Colour system | The five colours, exactly (Forest, Sage, Sand, Ivory, Charcoal) and their roles. |
| 8 Typography | Plus Jakarta Sans for all UI; Lora for emotional headlines, public site only. |
| 10 Iconography | 2px stroke, rounded, minimal: lucide matches. |
| 11, 15 UI direction, homepage | Generous spacing, clear CTA, calm surfaces, transparent status; soft, rounded white cards on Ivory. |
| 12 Tone of voice, 17 Do / Don't | The voice and guardrails below. |

## Principles

1. **Calm before loud.** The people using this handle deaths, burials and money. The interface is quiet and precise, on Ivory with white cards. Colour is spent on meaning (status, deadline, the current place), not on decoration.
2. **Forest leads, Sage supports, Sand is rare.** Forest marks the primary action, the current place (active nav item, selected tab) and keyboard focus. Sage carries supporting elements. Sand is a sparing highlight.
3. **State says what to do.** Every status, empty list and error explains what it means, its limits and the next step, in `CONTEXT.md` words. Errors don't apologise and are never vague.
4. **Comfortable by default.** Comfortable density everywhere; a compact option only on dense admin tables. Field screens (Mitra Jasa, Petugas Lapangan) are phone-first, with one full-width 44px action per card.
5. **The glossary is the UI copy.** Labels, statuses, buttons and toasts use `CONTEXT.md` terms exactly. Bahasa Indonesia, sentence case, no internal ticket numbers.

## Voice and tone

The brand voice is **warm, clear and not judgemental** (hangat, jelas, tidak menghakimi). These are writing rules for UI copy, WhatsApp templates and content drafts alike.

| Trait | Guideline example | In the product |
|---|---|---|
| Warm | "Kami siap membantu keluarga menemukan langkah yang paling tepat." | Speak to people, not at them; offer help, never blame ("Nomor ini belum terdaftar", not "Nomor salah"). |
| Clear | "Ketersediaan akhir dikonfirmasi sebelum pesanan difinalisasi." | Say what is certain and what is not yet; name times and amounts exactly. |
| Respectful | "Tempat peristirahatan yang menyimpan cerita dan kenangan." | Plain, dignified words; no jokes, no exclamation marks, no dramatic grief. |
| Helpful | "Jika Anda membutuhkan bantuan, tim kami siap mendampingi." | Every dead end names the next step or who can help (CS WhatsApp). |

**Guardrails** (guideline p. 17):

- **No hard selling.** No urgency tricks, countdown pressure or upsell nags. Offer the next step; don't push it.
- **No uncertain claims.** Don't promise what isn't confirmed (availability, dates, outcomes). Say when it will be confirmed and by whom.
- **Explain status and limits.** Every status says what it means and what happens next; every deadline and limit is stated plainly.
- **Protect privacy.** Never expose family documents or personal data beyond what the task needs; documents are served only through short-lived signed URLs.

North star: every touchpoint should leave the person feeling **Dibantu, Jelas, Aman** (helped, clear, safe).

### Brand words vs the glossary

Brand and marketing material may use its own words; the product uses `CONTEXT.md` terms.

| Brand / marketing | In the product (UI, documents, messages) |
|---|---|
| Invoice | **Tagihan**. Never "Invoice". |
| pengelola, TPS | Lokasi Mitra, Admin Lokasi |
| "Verified Partner" ID card | A physical item only. The UI shows **no** such badge; Terverifikasi is a listing gate (ticket 24), shown as a status. |

## Logo

Interim, until the brand designer delivers a vector (SVG) master with one-colour and small-icon (favicon / PWA) versions: the wordmark **MAKAM.CO.ID** in Plus Jakarta Sans bold (Forest on light, Ivory on dark, tracking 0.04em) beside a downscaled raster of the conceptual mark from guideline p. 6. The raster is `public/brand/makam-mark.png` (45 × 96 px, transparent, extracted from the PDF's embedded image and its soft mask); show it at 48px tall or less so it stays sharp on 2× screens. Component: `BrandLogo` / `BrandMark` (prototype `_shell/brand-mark.tsx`). The collapsed sidebar and the phone header show the mark alone.

## Tokens

All tokens are CSS custom properties with a light value (`:root`) and a dark value (`.dark`), mapped to Tailwind utilities through `@theme inline`. Components use the semantic names (`bg-primary`, `text-danger-soft-foreground`), never raw colours or Tailwind palette colours (`text-emerald-700`).

### Brand palette

The five guideline colours, exact, as raw tokens. Role tokens point at them.

| Token | Hex | oklch | Role (guideline) |
|---|---|---|---|
| `forest` | `#29483A` | `oklch(0.373 0.044 164)` | Primary |
| `sage` | `#8FA99A` | `oklch(0.711 0.036 160)` | Secondary |
| `sand` | `#D8C6A5` | `oklch(0.833 0.049 83)` | Accent |
| `ivory` | `#F7F4ED` | `oklch(0.968 0.010 88)` | Background |
| `charcoal` | `#303330` | `oklch(0.317 0.007 145)` | Text |

The guideline's proportion (Forest 50 / Sage 25 / Sand 15 / Ivory 7 / Charcoal 3) is for marketing compositions. In the product the Ivory ground and white cards take most of the area, and Forest, Sage and Sand keep their order of prominence.

### Roles (light)

| Token | Value | Hex | Use |
|---|---|---|---|
| `background` | `var(--ivory)` | `#F7F4ED` | Page |
| `card` / `popover` | `oklch(1 0 0)` | `#FFFFFF` | Cards, tables, menus, dialogs |
| `foreground` | `var(--charcoal)` | `#303330` | Text |
| `primary` (= `brand`) | `var(--forest)` | `#29483A` | Primary button, active nav, selected tab, links |
| `primary-foreground` | `var(--ivory)` | `#F7F4ED` | Text on Forest |
| `brand-soft` / `-foreground` | `oklch(0.93 0.018 158)` / Forest | `#DFECE3` / `#29483A` | Active nav item background, avatar, bottom-nav pill |
| `secondary` / `-foreground` | `var(--sage)` / Charcoal | `#8FA99A` / `#303330` | Secondary button, supporting surfaces |
| `sage-strong` | `oklch(0.5 0.04 160)` | `#506B5B` | Sage used as text (plain Sage is only 2.3:1 on Ivory) |
| `accent` / `-foreground` | `oklch(0.95 0.02 85)` / Charcoal | `#F5EEE0` | shadcn's hover / highlighted-item surface: a light Sand tint |
| `highlight` / `-foreground` | `var(--sand)` / Forest | `#D8C6A5` / `#29483A` | Sparing highlight (a key label, the public CTA on Forest) |
| `ring` | `var(--forest)` | `#29483A` | Focus ring |
| `ring` (dark) | `oklch(0.72 0.05 160)` | `#8AAF9A` | |

**Neutrals** are warm green-grey (hue 95–150, chroma ≤ 0.018), never plain grey:

| Token | Light | Dark | Use |
|---|---|---|---|
| `subtle` | `oklch(0.982 0.005 95)` `#FAF9F5` | `oklch(0.21 0.02 162)` `#101B15` | Table header, hover |
| `muted` | `oklch(0.94 0.01 100)` `#ECEBE4` | `oklch(0.28 0.022 162)` `#1F2C26` | Tracks, segmented control |
| `muted-foreground` | `oklch(0.5 0.018 150)` `#5C665E` | `oklch(0.78 0.022 150)` `#AEBCB0` | Secondary text |
| `border` / `border-strong` / `input` | `oklch(0.905 0.012 100)` `#E1E0D7` / `0.83` / `0.86` L | `oklch(0.9 0.03 150 / 10%)` / 18% / 15% | Lines |
| `sidebar` | `oklch(0.955 0.012 95)` `#F2F0E7` | `oklch(0.165 0.02 162)` `#06110C` | Sidebar |

### Dark mode (staff area only)

Derived from the brand, not an inversion: a very dark Forest ground, Ivory text, Sage and Sand accents. The public site is light only.

| Token | Value | Hex |
|---|---|---|
| `background` | `oklch(0.19 0.02 162)` | `#0B1711` |
| `card` / `popover` | `oklch(0.225 0.022 162)` / `oklch(0.25 0.022 162)` | `#121F19` / `#18251E` |
| `foreground` | `var(--ivory)` | `#F7F4ED` |
| `primary` (= `brand`) | `oklch(0.78 0.045 160)` (light Sage) | `#9FC1AE` |
| `primary-foreground` | `oklch(0.22 0.03 162)` | `#0D1F16` |
| `brand-soft` / `-foreground` | `oklch(0.31 0.035 162)` / `oklch(0.9 0.035 155)` | `#1F362B` / `#CDE5D4` |
| `secondary` | `oklch(0.33 0.03 162)` | `#273A31` |
| `highlight` | `var(--sand)` | `#D8C6A5` |

### Semantic

Muted to sit with the calm palette, and kept separate from the brand roles. Each has a solid (dots, icons, bars, the destructive confirm button), a `-foreground` for text on the solid, a `-soft` background and a `-soft-foreground` text for badges and banners.

| Tone | Solid light | Soft / soft-fg light | Solid dark | Soft / soft-fg dark | Means |
|---|---|---|---|---|---|
| `success` | `oklch(0.53 0.075 152)` `#497856` | `#E3F1E3` / `#33573D` | `oklch(0.72 0.08 152)` `#7EB38C` | `#1E3424` / `#B9E0C0` | Done, in good standing |
| `warning` | `oklch(0.74 0.105 75)` `#D2A15B` | `#FBEFD6` / `#794C20` | `oklch(0.8 0.1 80)` `#E0B771` | `#3E2D15` / `#F3D79E` | Needs attention soon, or restricted |
| `danger` (= `destructive`) | `oklch(0.55 0.13 28)` `#B14F45` | `#FDE9E6` / `#8F3830` | `oklch(0.68 0.12 28)` `#D87A6E` | `#4A231F` / `#FCC0B8` | Past a deadline, act now; destructive actions |
| `info` | `oklch(0.56 0.06 235)` `#517A93` | `#E5F0F7` / `#2B5470` | `oklch(0.72 0.06 235)` `#80ABC5` | `#1D303E` / `#B2D7EE` | Waiting on someone else; neutral notices |
| `neutral-soft` | | `#EAEAE3` / `#494F47` | | `#26312B` / `#C3CEC4` | Not started, or ended for good |

### Antrean deadline bar

The tenggat bar on each Antrean row runs **Sage → Sand/amber → muted red** as its window is used up, with **full red only once Terlambat**. Tiers: more than 50% of the window left `deadline-calm` (Sage); 20–50% left `deadline-soon` (`oklch(0.78 0.095 80)` `#D7B16F`); under 20% left `deadline-near` (`oklch(0.66 0.1 32)` `#C87B6B`); past the deadline `deadline-late` (= `danger`). The words beside the bar ("35 menit lagi", "Lewat 12 menit") carry the meaning, so the bar is reinforcement. No pulsing or animation.

Charts: `chart-1`…`chart-5` are Forest, Sage, Sand, the info blue and the muted red. (Charts / BI dashboards are out of scope for v1.)

### Typography

**Plus Jakarta Sans** (`--font-sans`, `next/font/google`, variable 200–800) for all UI, staff and public. **Geist Mono** (`--font-mono`) only for codes someone copies or reads out: Nomor Pemesanan, rekening. **Lora** (`--font-serif`, not preloaded) only for emotional headlines, quotes and storytelling on the public site; **never in the staff area**. Every table cell uses `tabular-nums` (globals.css), and so do stats and times.

Plus Jakarta Sans sets wider than Geist, so headings take less negative tracking and small text a touch of positive tracking:

| Utility | Size / line | Weight, tracking | Use |
|---|---|---|---|
| `text-display` | 30 / 36 | 600, −0.02em | The number on a StatCard |
| `text-title-1` | 24 / 32 | 600, −0.015em | Page title, one `h1` per page |
| `text-title-2` | 18 / 26 | 600, −0.008em | Section heading |
| `text-title-3` | 15 / 22 | 600, −0.003em | Panel, card, dialog title |
| `text-body-lg` | 16 / 24 | 400 | Phone inputs, long text |
| `text-body` | 14 / 20 | 400 | Default staff text |
| `text-small` | 13 / 18 | 400, 0.003em | Descriptions, meta, secondary cells |
| `text-caption` | 12 / 16 | 400–500, 0.01em | Badges, table headers, times |

`cn` must come from `@/lib/utils`: it registers these sizes with the class merger. The bare `cn` package would take `text-small` for a colour and drop it next to `text-muted-foreground`. `shadcn add` writes `import { cn } from "cn"`; change it after each add.

### Spacing, layout and density

Tailwind's 4px step is the scale (`--space-1` … `--space-12` name 4–48px). Named layout decisions: `--page-gutter` (16px phone, 32px ≥ md), `--page-max-width` 80rem, `--section-gap` 32px between page sections, `--header-height` 56px, `--bottom-nav-height` 64px, `--touch-target` 44px, `--row-height` 48px (comfortable, the default) and `--row-height-compact` 36px. Cards use 20–24px padding. `DataTable` offers the Nyaman / Rapat switch only when a page passes `densityToggle` (dense admin lists such as Lokasi Mitra); everything else stays comfortable.

### Radius

Softer and rounder, as in the guideline's cards. One base, `--radius: 0.625rem` (10px): `sm` 6px (kbd, chips), `md` 8px (badges, menu items), `lg` 10px (buttons, inputs), `xl` 12px (cards, tables, dialogs, popovers), `full` (avatars, dots).

### Shadow

Elevation, not decoration. Resting surfaces (cards, tables, panels) use a 1px `border`, no shadow. `shadow-xs` for the active segment, `shadow-md` for menus and popovers, `shadow-lg` for dialogs and sheets. Light shadows are tinted Forest; dark mode uses deeper shadows plus a faint top highlight.

### Motion

`--duration-instant` 80ms, `--duration-fast` 140ms (hover, press), `--duration-base` 200ms (open, expand), `--duration-slow` 320ms (sheets). Easing `--ease-standard` `cubic-bezier(0.2,0,0,1)`, `--ease-emphasized` for entering, `--ease-exit` for leaving. Motion only answers an action; nothing moves on its own (the Bertugas dot is a still dot with a soft halo). `prefers-reduced-motion` cuts every animation to 1ms.

### Icons

lucide, which matches the guideline's 2px stroke, rounded, minimal style. Don't mix in another icon set.

## Components

shadcn primitives (style `base-nova`, Base UI, lucide icons): button, badge, card, table, sidebar, sheet, dropdown-menu, command, dialog, popover, input, textarea, select, tabs, tooltip, skeleton, sonner, breadcrumb, avatar, separator, field, label, chart. Add more only through `npx shadcn@latest add`.

makam compositions (`src/components/makam/`):

| Component | What it is |
|---|---|
| `PageHeader` | The top of every page: one `h1`, an optional StatusBadge beside it, a one-line description, facts underneath, actions on the right (primary last). |
| `DataTable` | TanStack Table v9 list: search, one filter, pagination, a row action menu (secondary actions; destructive ones last, after a separator), comfortable or compact density, and a "no match" state. Rows link to detail through the first column. |
| `FormSection` | One group of fields. Title and description on the left from `md`, fields on the right, sections separated by a rule. |
| `EmptyState` | Empty list, tab or panel; `tone="error"` for a failed load. Icon, a title saying what would be here, one action. |
| `StatCard` | One dashboard number, its label and the one fact that says whether to act. `attention="warning" | "danger"` tints only the note. Links to the list it counts. |
| `StatusBadge` | The status vocabulary below. |
| `ConfirmDialog` | Before a write that is hard to undo. The confirm button repeats the verb; destructive ones use the danger fill; `reasonLabel` makes a reason required and says it goes to the Audit Log. |
| `RoleSwitcher` | Switch between the staff roles one Akun holds. Hidden when it holds one. |
| `LokasiSwitcher` | Searchable picker for the Lokasi Mitra an Admin Lokasi works on. |
| `ThemeToggle` | Terang, Gelap, Ikuti perangkat (next-themes). |

## Usage rules

| Situation | Pattern |
|---|---|
| Many records of one kind | **List**: PageHeader + DataTable. Search always; at most one filter up front; pagination at 8–25 rows. |
| One record | **Detail**: PageHeader with status and facts, `Tabs variant="line"`, each tab a URL (`?tab=`), panels with a border. |
| Changing settings or a record | **Form**: PageHeader + FormSections, react-hook-form with the same Zod schema as the Server Action, errors inline under the field on blur, a sticky footer with the save state and Simpan / Batalkan perubahan, a Sonner toast with the result. |
| Work to do today | **Queue / dashboard**: StatCards (4 max) and a task list, most urgent first, each row with a tenggat bar and an "Ambil" action. |
| An action that can't be undone, or needs a reason for the Audit Log | ConfirmDialog. Never a toast with undo. |
| A result the user caused (saved, taken) | Toast, top centre, one sentence plus what it means. The toast repeats the button's verb: Simpan → "… disimpan". |
| A standing notice about the page | Inline banner (`bg-info-soft`, `bg-warning-soft`), not a toast. |
| Nothing to show | EmptyState with the action that fills it. |
| Loading | Skeletons the size of the content. No spinners on page loads. |
| Failed | EmptyState `tone="error"`: what happened, that data is safe, "Coba lagi". |
| Phone, Admin roles | Sidebar becomes a sheet (header menu button). |
| Phone, Mitra Jasa and Petugas Lapangan | Bottom navigation, 4 items max, cards with one full-width action. |

Buttons: one `default` (Forest) button per view, the primary action. `outline` for secondary actions, `ghost` for toolbars and icon buttons, `destructive` (soft) in menus; a destructive confirm uses the solid danger fill. `secondary` (Sage) for a supporting action beside it when outline is too weak. Links inside text use `text-brand`.

## Status vocabulary

One mapping in `StatusBadge` (`statusVocabulary`). The label always carries the meaning; the tone and dot only reinforce it. Lokasi Mitra labels come from `src/app/staf/lokasi/labels.ts`.

| Key | Label | Tone | Why |
|---|---|---|---|
| `belum_tayang` | Belum Tayang | neutral | Not started (not listed yet) |
| `terverifikasi` | Terverifikasi | success | In good standing, listed |
| `ditangguhkan` | Ditangguhkan | warning | Restricted, reversible |
| `berhenti` | Berhenti | neutral (hollow dot) | Ended for good; not urgent |
| `terlambat` | Terlambat | danger | Past its deadline, act now |
| `lunas` | Lunas | success | Paid |
| `belum_dibayar` | Belum Dibayar | warning | Waiting for payment |
| `diajukan` | Diajukan | info | Waiting on someone else |
| `dikonfirmasi` | Dikonfirmasi | success | Accepted, going ahead |

New statuses join this table (and the component) before they appear on a screen. Danger is kept for "past a deadline"; don't use red for ordinary negative states.

## Accessibility

- **Contrast** (WCAG 2.2 AA, computed from the token values; text ≥ 4.5:1 on every surface it appears on):
  - Light: Charcoal on Ivory 11.6:1, on white 12.8:1; muted-foreground 5.4 (Ivory), 6.0 (white), 5.0 (muted), 5.2 (sidebar); Ivory on Forest (primary button) 9.2:1; Forest on brand-soft (active nav) 8.3:1, on Ivory 9.2:1; Charcoal on Sage (secondary button) 5.1:1; Forest on Sand (highlight) 6.0:1; sage-strong on Ivory 5.3:1 (plain Sage `#5F7A6C` would be 4.3:1, so it isn't used for text); badge text on its soft background: success 7.0, warning 6.4, danger 6.5, info 7.0, neutral 7.0; text on solids: white on danger 5.2, white on info 4.6, near-white on success 5.0, warning-foreground on warning 5.9.
  - Dark: Ivory on the Forest ground 16.7:1, on cards 15.5:1; muted-foreground 7.3–9.7:1; primary-foreground on light Sage 8.8:1; brand-soft pair 9.7:1; badge pairs 8.3–9.4:1; highlight 9.5:1.
  - Focus ring (solid) vs the page: Forest on Ivory 9.2:1, dark ring 7.6:1. Deadline bars against their track are 1.7–2.7:1 in light mode and are reinforcement only; the words beside them carry the meaning.
- **Colour is never alone**: statuses carry their label, deadlines carry their words ("Lewat 12 menit"), invalid fields carry a message.
- **Focus**: every interactive element shows a 3px `ring` at 50% plus a ring-coloured border on `:focus-visible`. Don't remove outlines without that replacement.
- **Touch targets ≥ 44px**: on `pointer: coarse`, buttons, inputs, selects, menu items, command items and sidebar items grow to `--touch-target` (globals.css). Bottom navigation items and the field-role card actions are 44px everywhere. Desktop keeps 32px controls.
- **Semantics**: one `h1` per page (PageHeader), `aria-current="page"` on the active nav item, `role="meter"` on tenggat bars, `aria-live` on pagination counts, labels on every icon-only button, `lang="id"`.
- **Inputs on phones** use 16px text so iOS doesn't zoom.
- **Reduced motion** is honoured globally.

## Open questions (for the user)

1. Sidebar grouping and labels for Admin Platform (Kerja harian / Lokasi dan harga / Orang / Operator).
2. Status colours: review the tone of each status in the vocabulary (for example whether Belum Dibayar is warning or info before its due date).
3. Where the catalogue lives for real once the prototype is gone: a staff page for Admin Platform, or development only.
4. Bottom navigation items for Mitra Jasa and Petugas Lapangan (currently Pekerjaan, Pencairan, Peringatan, Akun; 4 max).
