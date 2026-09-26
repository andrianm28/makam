# Makam.co.id design system (v0, prototype)

The single source of truth for the staff area, and later the public site. Tokens live in `src/app/globals.css`, compositions in `src/components/makam/`, shadcn primitives in `src/components/ui/`. The live catalogue is `/pratinjau/staf/katalog`; it reads its colour values from `globals.css` at request time, so it can't drift from the tokens. In development only.

Status: first version, written with the throwaway prototype (`src/app/(pratinjau)/pratinjau/staf/`). The user has not decided on it yet. Open questions are at the end.

## Principles

1. **Calm before loud.** The people using this handle deaths, burials and money. The interface is quiet, neutral and precise. Colour is spent on meaning (status, deadline, the current place), not on decoration.
2. **One accent, three jobs.** The brand accent marks the primary action, the current place (active nav item, selected tab) and keyboard focus. Nothing else is brand-coloured.
3. **State says what to do.** Every status, empty list and error tells the reader the next step in `CONTEXT.md` words. Errors don't apologise and are never vague.
4. **Dense on desktop, generous on phones.** Admin screens are comfortable by default, with a compact table option. Field screens (Mitra Jasa, Petugas Lapangan) are phone-first, with one full-width 44px action per card.
5. **The glossary is the UI copy.** Labels, statuses, buttons and toasts use `CONTEXT.md` terms exactly (Lokasi Mitra, Antrean, Peringatan Staf, Tarif Diperiksa…). Avoided words stay avoided. Bahasa Indonesia, sentence case, no internal ticket numbers.

## Tokens

All tokens are CSS custom properties with a light value (`:root`) and a dark value (`.dark`), mapped to Tailwind utilities through `@theme inline`. Components use the semantic names (`bg-primary`, `text-danger-soft-foreground`), never raw colours or Tailwind palette colours (`text-emerald-700`).

### Colour

Neutrals are grey with a trace of the brand hue (172, chroma ≤ 0.012), so they sit with the accent without looking tinted.

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | `oklch(0.99 0.002 172)` | `oklch(0.175 0.006 172)` | Page |
| `card` / `popover` | `oklch(1 0 0)` | `oklch(0.205 …)` / `oklch(0.225 …)` | Panels, menus |
| `subtle` | `oklch(0.977 0.003 172)` | `oklch(0.195 0.007 172)` | Table header, hover |
| `muted` | `oklch(0.962 0.004 172)` | `oklch(0.25 0.008 172)` | Tracks, segmented control |
| `foreground` | `oklch(0.22 0.012 172)` | `oklch(0.955 0.004 172)` | Text |
| `muted-foreground` | `oklch(0.49 0.012 172)` | `oklch(0.72 0.01 172)` | Secondary text |
| `border` / `border-strong` / `input` | `0.915` / `0.84` / `0.87` L | white 9% / 16% / 14% | Lines |
| `ring` | `oklch(0.58 0.08 172)` | `oklch(0.66 0.08 172)` | Focus ring |

**Brand accent, "Kamboja"** (sage-teal, the leaves of the frangipani that shades Indonesian cemeteries):

| Token | Light | Dark |
|---|---|---|
| `brand` (= `primary`) | `oklch(0.5 0.07 172)` ≈ `#33705f` | `oklch(0.74 0.08 172)` ≈ `#74bca5` |
| `brand-foreground` | `oklch(0.99 0.004 172)` | `oklch(0.2 0.03 172)` |
| `brand-soft` | `oklch(0.95 0.022 172)` | `oklch(0.29 0.04 172)` |
| `brand-soft-foreground` | `oklch(0.37 0.06 172)` | `oklch(0.85 0.06 172)` |

**Semantic.** Each has a solid (dots, icons, bars, the destructive confirm button), a `-foreground` for text on the solid, a `-soft` background and a `-soft-foreground` text for badges and banners.

| Tone | Solid light / dark | Means |
|---|---|---|
| `success` | `oklch(0.52 0.12 152)` / `oklch(0.7 0.13 152)` | Done, in good standing |
| `warning` | `oklch(0.74 0.14 72)` / `oklch(0.8 0.14 78)` | Needs attention soon, or restricted |
| `danger` (= `destructive`) | `oklch(0.56 0.19 27)` / `oklch(0.68 0.17 25)` | Past a deadline, act now; destructive actions |
| `info` | `oklch(0.55 0.13 250)` / `oklch(0.7 0.12 250)` | Waiting on someone else; neutral notices |
| `neutral-soft` | `oklch(0.945 0.005 172)` / `oklch(0.27 0.008 172)` | Not started, or ended for good |

Charts: `chart-1` is the brand, `chart-2`…`chart-5` are a lighter brand, olive, blue and amber. (Charts / BI dashboards are out of scope for v1; the tokens exist for the few inline figures a page may need.)

### Typography

One family, **Geist** (`--font-sans`). **Geist Mono** only for codes someone copies or reads out: Nomor Pemesanan, rekening, Nomor Makam in a list. Numbers in tables and stats use `tabular-nums`.

| Utility | Size / line | Weight, tracking | Use |
|---|---|---|---|
| `text-display` | 30 / 36 | 600, −0.022em | The number on a StatCard |
| `text-title-1` | 24 / 32 | 600, −0.018em | Page title, one `h1` per page |
| `text-title-2` | 18 / 26 | 600, −0.01em | Section heading |
| `text-title-3` | 15 / 22 | 550, −0.005em | Panel, card, dialog title |
| `text-body-lg` | 16 / 24 | 400 | Phone inputs, long text |
| `text-body` | 14 / 20 | 400 | Default staff text |
| `text-small` | 13 / 18 | 400 | Descriptions, meta, secondary cells |
| `text-caption` | 12 / 16 | 400–500 | Badges, table headers, times |

`cn` must come from `@/lib/utils`: it registers these sizes with the class merger. The bare `cn` package would take `text-small` for a colour and drop it next to `text-muted-foreground`. `shadcn add` writes `import { cn } from "cn"`; change it after each add.

### Spacing and layout

Tailwind's 4px step is the scale (`--space-1` … `--space-12` name 4–48px). Named layout decisions: `--page-gutter` (16px phone, 32px ≥ md), `--page-max-width` 80rem, `--section-gap` 32px between page sections, `--header-height` 56px, `--bottom-nav-height` 64px, `--touch-target` 44px, `--row-height` 44px (comfortable) and `--row-height-compact` 36px.

### Radius

One base, `--radius: 0.5rem` (8px), a little tighter than shadcn's default, for a crisper Linear/Vercel feel. Larger surfaces get larger radii: `sm` 4.8px (kbd, chips), `md` 6.4px (badges, menu items), `lg` 8px (buttons, inputs, cards, tables), `xl` 11.2px (dialogs, popovers), `full` (avatars, dots).

### Shadow

Elevation, not decoration. Resting surfaces (cards, tables, panels) use a 1px `border`, no shadow. `shadow-xs` for the active segment, `shadow-md` for menus and popovers, `shadow-lg` for dialogs and sheets. Dark mode uses deeper shadows plus a faint top highlight.

### Motion

`--duration-instant` 80ms, `--duration-fast` 140ms (hover, press), `--duration-base` 200ms (open, expand), `--duration-slow` 320ms (sheets). Easing `--ease-standard` `cubic-bezier(0.2,0,0,1)`, `--ease-emphasized` for entering, `--ease-exit` for leaving. Motion only answers an action; nothing moves on its own except the Bertugas pulse. `prefers-reduced-motion` cuts every animation to 1ms.

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

Buttons: one `default` (brand) button per view, the primary action. `outline` for secondary actions, `ghost` for toolbars and icon buttons, `destructive` (soft) in menus; a destructive confirm uses the solid danger fill. Links inside text use `text-brand`.

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

- **Contrast** (WCAG 2.2 AA, measured from the oklch values): text ≥ 4.5:1 on every surface it appears on. Light: foreground 16.8:1, muted-foreground 5.6–6.2:1, white on brand 5.6:1, every `-soft-foreground` on its `-soft` 6.4–8.8:1. Dark: foreground 16.6:1, muted-foreground 6.5–7.7:1, every soft pair 8.0–9.2:1. The ring is ≥ 3:1 against the page (4.0 light, 6.3 dark).
- **Colour is never alone**: statuses carry their label, deadlines carry their words ("Lewat 12 menit"), invalid fields carry a message.
- **Focus**: every interactive element shows a 3px `ring` at 50% plus a ring-coloured border on `:focus-visible`. Don't remove outlines without that replacement.
- **Touch targets ≥ 44px**: on `pointer: coarse`, buttons, inputs, selects, menu items, command items and sidebar items grow to `--touch-target` (globals.css). Bottom navigation items and the field-role card actions are 44px everywhere. Desktop keeps 32px controls.
- **Semantics**: one `h1` per page (PageHeader), `aria-current="page"` on the active nav item, `role="meter"` on tenggat bars, `aria-live` on pagination counts, labels on every icon-only button, `lang="id"`.
- **Inputs on phones** use 16px text so iOS doesn't zoom.
- **Reduced motion** is honoured globally.

## Open questions (for the user)

1. Accent: Kamboja sage-teal (A), Zaitun olive (B), or Tinta (C: near-black primary buttons, teal only for the current place and focus). Compare with the prototype bar.
2. Density: comfortable default with a per-user compact toggle for tables, or compact by default for Admin Platform?
3. Sidebar grouping and labels for Admin Platform (Kerja harian / Lokasi dan harga / Orang / Operator).
4. Where the Catalogue lives once the prototype is gone: a staff page for Admin Platform, or development only.
