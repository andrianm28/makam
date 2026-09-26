# Makam.co.id design system

The single source of truth for the staff area, the public site, PDF documents (Tagihan, Bukti) and email. Tokens live in `src/app/globals.css`, makam compositions in `src/components/makam/`, shadcn primitives in `src/components/ui/`, and the staff shell in `src/app/staf/` (`staff-shell.tsx`, `navigation.ts`).

Decided with the user on 2026-09-26 (spec, Implementation Decisions > "Staff UI and design system"). The look was settled on a throwaway prototype; what is on `main` is rebuilt test-first, slice by slice. A live catalogue page for Admin Platform follows in its own slice; until then this document is the reference.

## Brand source

The primary source is the official **MAKAM.CO.ID Brand Guideline (Visual 2026)**, `docs/brand/brand-guideline-visual-2026.pdf` (18 pages). It overrides every earlier prototype choice (the "Kamboja" accent, Geist sans and the frangipani placeholder logo are gone). What this system takes from it:

| Guideline page | What we use |
|---|---|
| 2, 5, 18 Essence, personality, north star | Calm, warm, respectful, trusted, modern. North star: every touchpoint makes people feel **Dibantu, Jelas, Aman**. |
| 6 Logo concept | The conceptual mark (infinity + path + pin + leaves), as an interim raster (see Logo). |
| 7 Colour system | The five colours, exactly (Forest, Sage, Sand, Ivory, Charcoal) and their roles. |
| 8 Typography | Plus Jakarta Sans for all UI; Lora for emotional headlines, public site only. |
| 10 Iconography | 2 px stroke, rounded, minimal: lucide matches. |
| 11, 15 UI direction, homepage | Generous spacing, clear CTA, calm surfaces, transparent status; soft, rounded light cards on Ivory (a warm off-white, not pure white). |
| 12 Tone of voice, 17 Do / Don't | The voice and guardrails below. |

## Principles

1. **Calm before loud.** The people using this handle deaths, burials and money. The interface is quiet and precise, on Ivory with warm off-white cards. Colour is spent on meaning (status, deadline, the current place), not on decoration.
2. **Forest leads, Sage supports, Sand is rare.** Forest marks the primary action, the current place and keyboard focus. Sage carries supporting elements. Sand is a sparing highlight.
3. **State says what to do.** Every status, empty list and error explains what it means, its limits and the next step, in `CONTEXT.md` words. Errors don't apologise and are never vague.
4. **Comfortable by default.** Comfortable density everywhere; a compact option only on dense admin tables. Field screens (Mitra Jasa, Petugas Lapangan) are phone-first, with one full-width 44 px action per card.
5. **The glossary is the UI copy.** Labels, statuses, buttons and toasts use `CONTEXT.md` terms exactly. Bahasa Indonesia, sentence case, no internal ticket numbers (`src/app/no-ticket-numbers.test.ts` guards `src/app` and `src/components`).

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
- **No uncertain claims.** Don't promise what isn't confirmed (availability, dates, outcomes). Say when it will be confirmed and by whom. A page that is not built yet says so ("Segera hadir"), never with a date.
- **Explain status and limits.** Every status says what it means and what happens next; every deadline and limit is stated plainly.
- **Protect privacy.** Never expose family documents or personal data beyond what the task needs; documents are served only through short-lived signed URLs.

North star: every touchpoint should leave the person feeling **Dibantu, Jelas, Aman** (helped, clear, safe).

### Brand words vs the glossary

Brand and marketing material may use its own words; the product uses `CONTEXT.md` terms.

| Brand / marketing | In the product (UI, documents, messages) |
|---|---|
| Invoice | **Tagihan**. Never "Invoice". |
| pengelola, TPS | Lokasi Mitra, Admin Lokasi. "TPS" appears only in marketing copy, never in the product. |
| "Verified Partner" ID card | A physical item only. The UI shows **no** such badge; Terverifikasi is a listing gate, shown as a status. |

## Logo

Interim, until the brand designer delivers a vector (SVG) master with one-colour and small-icon (favicon / PWA) versions: the wordmark **MAKAM.CO.ID** in Plus Jakarta Sans bold (Forest on light, Ivory on dark, tracking 0.04em) beside a downscaled raster of the conceptual mark from guideline p. 6. The raster is `public/brand/makam-mark.png` (45 × 96 px, transparent, extracted from the PDF's embedded image and its soft mask); show it at 48 px tall or less so it stays sharp on 2× screens. Components: `BrandLogo` and `BrandMark` (`src/components/makam/brand-logo.tsx`). The collapsed sidebar shows the mark alone.

## Tokens

All tokens are CSS custom properties with a light value (`:root`) and a dark value (`.dark`), mapped to Tailwind utilities through `@theme inline`. Components use the semantic names (`bg-primary`, `text-success-soft-foreground`), never raw colours or Tailwind palette colours (`text-emerald-700`, `bg-black/10`); `src/app/brand-tokens.test.ts` fails on either in `src/app` or `src/components`, and on any hard-coded font family. `src/app/brand-tokens.test.ts` reads `globals.css` and checks the brand colours, the roles and every contrast pair below, so the tokens and this page can't drift apart silently.

### Brand palette

The five guideline colours, exact, as raw tokens. Role tokens point at them.

| Token | Hex | Role (guideline) |
|---|---|---|
| `forest` | `#29483A` | Primary |
| `sage` | `#8FA99A` | Secondary |
| `sand` | `#D8C6A5` | Accent (here: `highlight`) |
| `ivory` | `#F7F4ED` | Background |
| `charcoal` | `#303330` | Text |

The guideline's proportion (Forest 50 / Sage 25 / Sand 15 / Ivory 7 / Charcoal 3) is for marketing compositions. In the product the Ivory ground and off-white cards take most of the area, and Forest, Sage and Sand keep their order of prominence.

### Roles (light)

| Token | Value | Hex | Use |
|---|---|---|---|
| `background` | `var(--ivory)` | `#F7F4ED` | Page |
| `card` / `popover` | `oklch(0.985 0.007 89)` | `#FCFAF5` | Cards, tables, menus, dialogs, sheets. Warm off-white, never pure white; cards read as raised through the border and a faint `shadow-xs` |
| `foreground` | `var(--charcoal)` | `#303330` | Text |
| `primary` (= `brand`) | `var(--forest)` | `#29483A` | Primary button, focus, links |
| `primary-foreground` | `var(--ivory)` | `#F7F4ED` | Text on Forest |
| `brand-soft` / `-foreground` | `oklch(0.93 0.018 158)` / Forest | `#DFECE3` / `#29483A` | The active menu item (light Sage tint, semibold Forest text), avatar |
| `secondary` / `-foreground` | `var(--sage)` / Charcoal | `#8FA99A` / `#303330` | Secondary button, supporting surfaces |
| `sage-strong` | `oklch(0.5 0.04 160)` | `#506B5B` | Sage used as text (plain Sage is only 2.3:1 on Ivory) |
| `accent` / `-foreground` | `oklch(0.95 0.02 85)` / Charcoal | `#F5EEE0` / `#303330` | shadcn's hover / highlighted-item surface: a light Sand tint, so full Sand never spreads |
| `highlight` / `-foreground` | `var(--sand)` / Forest | `#D8C6A5` / `#29483A` | Sparing highlight (a key label, the public CTA on Forest) |
| `ring` | `var(--forest)` | `#29483A` | Focus ring |

**Neutrals** are warm green-grey (hue 95–150, chroma ≤ 0.018), never plain grey:

| Token | Light | Dark | Use |
|---|---|---|---|
| `subtle` | `#F9F7F1` | `#101B15` | Table header, hover |
| `muted` | `#ECEBE4` | `#1F2C26` | Tracks, segmented control |
| `muted-foreground` | `#5C665E` | `#AEBCB0` | Secondary text |
| `border` / `border-strong` / `input` | `oklch(0.905 0.012 100)` / L 0.83 / L 0.86 | `oklch(0.9 0.03 150 / 10%)` / 18% / 15% | Lines |
| `sidebar` | `#F2F0E7` | `#06110C` | Sidebar |

### Dark mode (staff area only)

Derived from the brand, not an inversion: a very dark Forest ground, Ivory text, Sage and Sand accents.

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

**Where it applies.** The theme is a class on `<html>` (next-themes, `src/components/makam/theme-provider.tsx`). Only the staff area follows the person's choice (Terang, Gelap, Ikuti perangkat; the header's theme toggle). Every other page (the public site, Masuk, Akun Saya and the TOTP step) is held to light by `forcedThemeFor()` in `src/lib/theme-scope.ts`.

### Semantic

Muted to sit with the calm palette, and kept separate from the brand roles. Each has a solid (dots, icons, bars, the destructive confirm button), a `-foreground` for text on the solid, a `-soft` background and a `-soft-foreground` text for badges and banners.

| Tone | Solid light | Soft / soft-fg light | Solid dark | Soft / soft-fg dark | Means |
|---|---|---|---|---|---|
| `success` | `#497856` | `#E3F1E3` / `#33573D` | `#7EB38C` | `#1E3424` / `#B9E0C0` | Done, in good standing |
| `warning` | `#D2A15B` | `#FBEFD6` / `#794C20` | `#E0B771` | `#3E2D15` / `#F3D79E` | Needs attention soon, or restricted |
| `danger` (= `destructive`) | `#B14F45` | `#FDE9E6` / `#8F3830` | `#D87A6E` | `#4A231F` / `#FCC0B8` | Past a deadline, act now; destructive actions |
| `info` | `#517A93` | `#E5F0F7` / `#2B5470` | `#80ABC5` | `#1D303E` / `#B2D7EE` | Waiting on someone else; neutral notices |
| `neutral-soft` | | `#EAEAE3` / `#494F47` | | `#26312B` / `#C3CEC4` | Not started, or ended for good |

### Antrean deadline bar

The tenggat bar on each Antrean row runs **Sage → Sand/amber → muted red** as its window is used up, with **full red only once Terlambat**: `deadline-calm` (Sage, more than 50 % left), `deadline-soon` (`#D7B16F`, 20–50 % left), `deadline-near` (`#C87B6B`, under 20 % left), `deadline-late` (= `danger`, past the deadline). The words beside the bar ("35 menit lagi", "Lewat 12 menit") carry the meaning; the bar is reinforcement. No pulsing or animation.

Charts: `chart-1`…`chart-5` are Forest, Sage, Sand, the info blue and the muted red (charts are out of scope for v1).

### Typography

**Plus Jakarta Sans** (`--font-sans` and `--font-heading` → `--font-plus-jakarta`, loaded with `next/font/google` in `src/app/layout.tsx`) for all UI, staff and public, and for the document pages (Tagihan, Bukti Pembayaran) and so their PDFs; its fallback is the system sans-serif, never a serif. **Geist Mono** (`--font-mono`, `font-mono`) only for codes someone copies or reads out: Nomor Pemesanan, rekening. **Lora** (`--font-serif`, `font-serif`, not preloaded) only for emotional headlines, quotes and storytelling on the public site; **never in the staff area**. Every table cell uses tabular figures (`td, th` in globals.css), and so do stats and times (`tabular-nums`).

| Utility | Size / line | Weight, tracking | Use |
|---|---|---|---|
| `text-display` | 30 / 36 | 600, −0.02em | The number on a StatCard |
| `text-title-1` | 24 / 32 | 600, −0.015em | Page title, one `h1` per page (PageHeader) |
| `text-title-2` | 18 / 26 | 600, −0.008em | Section heading |
| `text-title-3` | 15 / 22 | 600, −0.003em | Panel, card, dialog title |
| `text-body-lg` | 16 / 24 | 400 | Phone inputs, long text |
| `text-body` | 14 / 20 | 400 | Default staff text |
| `text-small` | 13 / 18 | 400, 0.003em | Descriptions, meta, secondary cells |
| `text-caption` | 12 / 16 | 400–500, 0.01em | Badges, table headers, times |

`cn` must come from `@/lib/utils`: it registers these sizes with the class merger (`src/lib/utils.test.ts`). The bare `cn` package would take `text-small` for a colour and drop it next to `text-muted-foreground`. `shadcn add` writes `import { cn } from "cn"`; change it after each add.

### Spacing, layout and density

Tailwind's 4 px step is the scale (`--space-1` … `--space-12` name 4–48 px). Named layout decisions: `--page-gutter` (16 px phone, 32 px ≥ md), `--page-max-width` 80rem, `--section-gap` 32 px between page sections, `--header-height` 56 px, `--bottom-nav-height` 64 px, `--touch-target` 44 px, `--row-height` 48 px (comfortable, the default) and `--row-height-compact` 36 px. Cards use 20–24 px padding.

### Radius

Soft and round, as in the guideline's cards. One base, `--radius: 0.625rem` (10 px): `sm` 6 px (chips), `md` 8 px (badges, menu items), `lg` 10 px (buttons, inputs), `xl` 12 px (cards, tables, dialogs, popovers), `full` (avatars, dots).

### Shadow

Elevation, not decoration. Resting surfaces (cards, tables, panels) use a 1 px `border` plus a faint Forest-tinted `shadow-xs`, so the off-white card lifts off Ivory without a colour jump. The shared `cardSurface` (`src/components/ui/card.tsx`) carries this for `Card`, `StatCard` and the document pages, so they never drift apart. The page behind a sheet or dialog dims with the `overlay` token (the Forest ground, faintly; deeper in dark mode). `shadow-md` for menus and popovers, `shadow-lg` for dialogs and sheets. Dark mode uses deeper shadows plus a faint top highlight.

### Motion

`--duration-instant` 80 ms, `--duration-fast` 140 ms (hover, press), `--duration-base` 200 ms (open, expand), `--duration-slow` 320 ms (sheets). Easing `--ease-standard`, `--ease-emphasized` for entering, `--ease-exit` for leaving. Motion only answers an action; nothing moves on its own. `prefers-reduced-motion` cuts every animation to 1 ms.

### Icons

lucide, which matches the guideline's 2 px stroke, rounded, minimal style. Don't mix in another icon set.

## The staff shell

Every staff role works inside one frame (`src/app/staf/layout.tsx` → `StaffShell`):

- **Sidebar**, collapsible to icons (the header's menu button, or Ctrl/⌘ B; the choice is kept in the `sidebar_state` cookie), with the current role's menu in named groups (`staffMenu()` in `src/app/staf/navigation.ts`). Admin Platform: **Kerja harian** (Beranda, Antrean) · **Lokasi dan harga** (Lokasi Mitra, Tarif global, Hari Libur Nasional) · **Orang** (Staf, Pindah Nomor) · **Operator** (Pengaturan Operator, Audit Log). An Admin Lokasi's menu is scoped to the Lokasi Mitra in the URL. An item whose page is not built yet shows disabled with "Segera", never as a dead link.
- **The active item** is a light Sage tint (`brand-soft`) with semibold Forest text and `aria-current="page"`; solid Forest stays reserved for primary buttons. A role's Beranda is active only on its own page; every other item also on the pages under it.
- **Header**: breadcrumbs (`staffBreadcrumbs()`: role › menu item › the pages below, naming a Lokasi Mitra by its name), the **role switcher** (only for an Akun holding several staff roles), the **theme toggle** and the **account menu** (number and email, Akun Saya, Email, Keluar).
- **On phones** the sidebar is a sheet opened from the header's menu button, and the role switcher moves into the account menu. (Bottom navigation for the field roles is a later slice.)
- The shell appears only for a signed-in Akun Staf past the TOTP step (`staffShell()` in `src/server/staff-area.ts`); the TOTP step renders bare, light, with the logo and Keluar. Each page still checks its own access on the server.

## Components

shadcn primitives (style `base-nova`, Base UI, lucide icons) on `main`: avatar, badge, breadcrumb, button, card, dropdown-menu (plus `DropdownMenuLinkItem` for menu items that navigate), input, separator, sheet, sidebar, skeleton, table, tooltip. Add more only through `npx shadcn@latest add` (then fix the `cn` import).

makam compositions (`src/components/makam/`):

| Component | What it is |
|---|---|
| `PageHeader` | The top of every page: one `h1`, an optional StatusBadge beside it, a one-line description, facts underneath, actions on the right (primary last). |
| `StatCard` | One dashboard number, its label and the one fact that says whether to act. `attention="warning" \| "danger"` tints only the note. Links to the list it counts. |
| `StatusBadge` | The status vocabulary below. |
| `EmptyState` | Empty list, tab or panel; `tone="error"` for a failed load. Icon, a title saying what would be here, one action. |
| `RoleSwitcher` | Switch between the staff roles one Akun holds. Hidden when it holds one. |
| `ThemeToggle` | Terang, Gelap, Ikuti perangkat (staff area only). |
| `BrandLogo`, `BrandMark` | The interim logo. |
| `ThemeProvider` | next-themes, with the public pages held to light. |

Still to come with the slices that first need them: `DataTable`, `FormSection`, `ConfirmDialog`, `LokasiSwitcher` (header), the command palette and the Peringatan Staf bell, the bottom navigation for field roles.

## Usage rules

| Situation | Pattern |
|---|---|
| Many records of one kind | **List**: PageHeader + DataTable. Search always; at most one filter up front; pagination at 8–25 rows. |
| One record | **Detail**: PageHeader with status and facts, tabs (each tab a URL), panels with a border. |
| Changing settings or a record | **Form**: PageHeader + form sections, the same Zod schema as the Server Action, errors inline under the field, a toast with the result. |
| Work to do today | **Queue / dashboard**: StatCards (4 max) and a task list, most urgent first. |
| An action that can't be undone, or needs a reason for the Audit Log | ConfirmDialog. Never a toast with undo. |
| A standing notice about the page | Inline banner (`bg-info-soft`, `bg-warning-soft`), not a toast. |
| Nothing to show | EmptyState with the action that fills it. |
| Loading | Skeletons the size of the content. No spinners on page loads. |
| Failed | EmptyState `tone="error"`: what happened, that data is safe, "Coba lagi". |

Buttons: one `default` (Forest) button per view, the primary action. `outline` for secondary actions, `ghost` for toolbars and icon buttons, `destructive` (soft) in menus; a destructive confirm uses the solid danger fill. `secondary` (Sage) for a supporting action when outline is too weak. Links inside text use `text-brand`.

## Status vocabulary

One mapping in `StatusBadge` (`statusVocabulary`, checked by `src/components/makam/status-badge.test.ts`). The label always carries the meaning; the tone and dot only reinforce it. Lokasi Mitra labels come from `src/lib/lokasi-labels.ts`, staff role names from `src/lib/staff-role-labels.ts`.

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

**Contrast** (WCAG 2.2 AA: text at least 4.5:1 on every surface it appears on). Computed from the token values by `src/app/brand-tokens.test.ts`, which fails if any pair drops below 4.5:1.

| Text on surface | Light | Dark |
|---|---|---|
| `foreground` on `background` | 11.6:1 | 16.7:1 |
| `card-foreground` on `card` | 12.3:1 | 15.5:1 |
| `popover-foreground` on `popover` | 12.3:1 | 14.5:1 |
| `foreground` on `subtle` (table header) | 11.9:1 | 16.0:1 |
| `foreground` on `muted` | 10.7:1 | 13.2:1 |
| `muted-foreground` on `background` / `card` / `subtle` / `muted` / `sidebar` | 5.4 / 5.7 / 5.6 / 5.0 / 5.2:1 | 9.3 / 8.6 / 8.9 / 7.3 / 9.7:1 |
| `primary-foreground` on `primary` (primary button) | 9.2:1 | 8.7:1 |
| `primary` on `background` / `card` (links) | 9.2 / 9.7:1 | 9.4 / 8.7:1 |
| `brand-soft-foreground` on `brand-soft` (active menu item) | 8.3:1 | 9.7:1 |
| `secondary-foreground` on `secondary` (Sage button) | 5.1:1 | 11.0:1 |
| `sage-strong` on `background` / `card` | 5.3 / 5.6:1 | 9.4 / 8.7:1 |
| `accent-foreground` on `accent` (hover) | 11.1:1 | 12.7:1 |
| `highlight-foreground` on `highlight` (Sand) | 6.0:1 | 9.5:1 |
| `sidebar-foreground` on `sidebar` | 11.2:1 | 15.2:1 |
| `sidebar-accent-foreground` on `sidebar-accent` | 10.3:1 | 13.6:1 |
| Badges, soft-foreground on soft: success / warning / danger / info / neutral | 7.1 / 6.4 / 6.5 / 7.0 / 7.0:1 | 9.3 / 9.5 / 8.6 / 8.9 / 8.3:1 |
| Soft-foreground directly on `card`: success / warning / danger / info | 7.9 / 7.0 / 7.2 / 7.7:1 | 11.7 / 12.2 / 10.8 / 11.2:1 |
| Text on solids: success / warning / danger / info | 4.9 / 5.9 / 5.2 / 4.6:1 | 7.5 / 8.6 / 6.2 / 7.7:1 |
| Focus ring (solid) on `background` | 9.2:1 | 7.6:1 |

Plain Sage is 2.3:1 on Ivory, so it is never used for text (use `sage-strong`). Deadline bars against their track are reinforcement only; the words beside them carry the meaning.

- **Colour is never alone**: statuses carry their label, deadlines carry their words, invalid fields carry a message.
- **Focus**: every interactive element shows a 3 px `ring` at 50 % plus a ring-coloured border on `:focus-visible`.
- **Touch targets ≥ 44 px**: on `pointer: coarse`, buttons, inputs, menu items and sidebar items grow to `--touch-target` (globals.css). Desktop keeps 32 px controls.
- **Semantics**: one `h1` per page (PageHeader), `aria-current="page"` on the active menu item, the menu as a `nav` named "Menu <peran>", breadcrumbs as a `nav` named "Jejak halaman", labels on every icon-only button, `lang="id"`.
- **Inputs on phones** use 16 px text so iOS doesn't zoom.
- **Reduced motion** is honoured globally.

## Decisions settled (user, 2026-09-26)

1. **Sand split**: shadcn's `accent` is a light Sand tint (hover and highlighted items); full Sand is the separate `highlight` token, used sparingly.
2. **Active menu item**: a Sage-tinted background (`brand-soft`) with semibold Forest text, not a solid Forest fill.
3. **Admin Platform menu groups**: Kerja harian · Lokasi dan harga · Orang · Operator, with Audit Log under Operator.
4. **Status colours as in the vocabulary**: red only for act-now (Terlambat); Berhenti neutral grey with a hollow dot; Dikonfirmasi green like Lunas; Belum Dibayar amber.
5. **Catalogue**: becomes a real Admin Platform staff page in its own slice.
6. **Bottom navigation** for Mitra Jasa and Petugas Lapangan (4 items max) in its own slice.
7. **Card surface**: warm off-white `#FCFAF5` instead of pure white in light mode.
8. **Dark mode** for the staff area only; the public site, Masuk, Akun Saya and the TOTP step stay light.
