# Scope of Wakaf Tanah in v1

Type: grilling
Status: resolved
Blocked by: 01, 03
Map: ../map.md

> **Amended by [Operator entity: PT Jaya Korpora Prima and YIEM's role](20-operator-entity.md)** (2026-09-25): read "YIEM" as the Operator (PT Jaya Korpora Prima), "Admin YIEM" as Admin Platform and "Petugas YIEM" as Petugas Lapangan. YIEM itself has left the product.

## Question

Given the regulation research and YIEM's nazhir status: what exactly does the platform do for Wakaf Tanah in v1 (intake form, uploading documents, statuses shown to the applicant, who reviews it), and where is the line to the offline process? Is YIEM the nazhir receiving the land or only a facilitator?

Context from "YIEM's current assets and records": YIEM owns no land, is not a nazhir, and legal compliance is out of scope for this map; YIEM is treated as a facilitator.

## Answer

Resolved by grilling with the user (2026-09-25).

- **Role**: YIEM is a **facilitator only**. It never receives the land, signs the AIW, or touches money. Every ikrar goes to a **Nazhir**. The form asks "Sudah ada Nazhir?": the Wakif either names their own or leaves it for Admin YIEM to match one offline from a short Nazhir list.
- **Nazhir list**: kept by Admin YIEM (name, type perorangan / organisasi / badan hukum, kabupaten/kota, contact, BWI registration number if known). Nazhir have no login. A Pengajuan Wakaf links to one list entry or stores the name the Wakif typed.
- **Intake form** (one short page): Tujuan sosial / keluarga (keluarga adds the beneficiary family name); Wakif name, WhatsApp and relationship to the land (owner / heir / representative); land kabupaten/kota, address, map pin, approx. m², proof of ownership (SHM / SHGB / girik-letter C / other / none); Nazhir. Documents (certificate, KTP, PBB) are **optional** uploads that can be added later; they never block sending.
- **Area**: applications are accepted from anywhere. Applications outside Jabodetabek are flagged automatically and closed as **Dirujuk** with a referral to the local KUA/BWI (a Nazhir needs a pengurus in the land's kabupaten). Only Jabodetabek applications get a survey.
- **Review**: only Admin YIEM, in a back-office queue. Admin Lokasi never see Pengajuan Wakaf.
- **Survey**: a Petugas YIEM visits and uploads photos, a checklist (access road, boundaries, land disputes, fit for burial) and a recommendation. This stays internal.
- **Statuses**, all set by hand by Admin YIEM, each change notifying the Wakif: `Diajukan → Ditinjau → Survei Dijadwalkan (date) → Menunggu Ikrar (KUA date) → Proses Sertipikat (BPN) → Selesai` (AIW/certificate scan uploaded). Terminal states: `Ditolak` (with a reason), `Dirujuk`, `Dibatalkan` (by the Wakif).
- **Offline line**: the survey visit, the majelis ikrar + AIW at the KUA/PPAIW, and BPN certification all happen offline. The platform only records their dates and the final scans.
- **Concept doc step 5** ("Penilaian komersial / non-komersial") is **dropped** (PP 9/1987). The purpose is captured at intake as Tujuan.
- **What the Wakif sees**: status and dates, the reason if Ditolak, their own uploads, and the final AIW/certificate scan. Survey reports and Admin YIEM notes stay internal.
- **Money**: none in v1. No facilitation fee, no donation / wakaf uang. PPAIW and BPN costs are paid by the Wakif offline.
- **Account**: whatever login "Roles, accounts and access" settles for Pemesan. Until then, assume tracking by WhatsApp number.
- **After Selesai**: no automatic link to a Lokasi Mitra. Admin YIEM may later offer the Nazhir a partnership through the normal manual onboarding.

Glossary: added **Wakif**, **Nazhir**, **Pengajuan Wakaf** to `CONTEXT.md`.

**Consistency review** (2026-09-25): "Roles, accounts and access" did not settle Wakif login; it is open in "Homepage, search and Akun Saya".
