# YIEM's current assets and records

Type: task
Status: resolved
Map: ../map.md

> **Amended by [Operator entity: PT Jaya Korpora Prima and YIEM's role](20-operator-entity.md)** (2026-09-25): read "YIEM" as the Operator (PT Jaya Korpora Prima), "Admin YIEM" as Admin Platform and "Petugas YIEM" as Petugas Lapangan. YIEM itself has left the product.

## Question

HITL: the user supplies facts only they know. (1) Which Lokasi Makam does YIEM manage or have signed partners for today, and in which cities? Roughly how many Petak Makam each? (2) Is YIEM a nazhir registered with BWI, or does it plan to become one? (3) How does each Lokasi keep its plot and Pemegang Hak records today (paper, Excel, an existing system)? (4) Current official tariffs for booking and Perpanjangan at those Lokasi. Record the answers; later tickets rely on them.

## Answer

Resolved by grilling with the user (2026-09-24).

- **Assets**: YIEM owns no land and runs no Lokasi Makam. It is a pure platform provider, targeting **Jabodetabek**. No partner is signed or in talks yet; v1 is sized for **3–10 Lokasi Mitra plus TPU in DKI** (thousands of Petak Makam, tens of orders per month).
- **Two kinds of Lokasi Makam in v1**:
  - **Lokasi Mitra**: private / wakaf / yayasan / masjid cemeteries that sign a partnership with YIEM. The platform is the **system of record** for their Petak Makam and Pemegang Hak; Admin Lokasi runs the inventory in the back office; existing records are imported once from an Excel template.
  - **TPU (DKI only in v1)**: directory information plus **Pengurusan** (YIEM files the burial permit for Pemesanan Saat Duka and the IPTM Perpanjangan on the family's behalf). No plot inventory, no Pemesanan Terencana (advance booking is banned in TPUs). TPU Bodetabek is deferred.
- **Who does the work at TPU**: Admin YIEM files online (JakEVO); Petugas YIEM (YIEM field staff) does in-person filings and field checks; Mitra Jasa (individual service providers paid per job) do physical Layanan at TPU only. Mitra Jasa get a minimal mobile account to see jobs, upload photo proof and mark done; they are paid a fixed rate per Layanan type, manually by YIEM on a regular cycle. At Lokasi Mitra, Layanan stays with Admin Lokasi.
- **Partner onboarding**: manual, by Admin YIEM: agreement signed offline → Admin YIEM creates the Lokasi Makam and enters tariffs → plots imported → Admin Lokasi invited.
- **Tariffs**: agreed per Lokasi Mitra in the partnership agreement and shown as fixed prices; for TPU the official Pemda retribusi (IPTM in DKI is currently free) is shown, with YIEM's Pengurusan fee shown separately.
- **Nazhir / legal**: legal compliance is out of scope for this map (licensing, nazhir status, whether fees may be commercial). Regulatory facts that shape product flow (TPU advance-booking ban, Pemda issues IPTM, wakaf ikrar in person at KUA) still apply as design constraints.
- **Current record-keeping at partners**: unknown (no partners yet); handled by the import template, see "Onboarding existing records" in the fog.

**Consistency review** (2026-09-25): Mitra Jasa are not paid "on a regular cycle": Pencairan is per job, due when the Keluhan window closes ("Mitra Jasa onboarding, service areas and quality"); Admin Platform may batch due Pencairan into one transfer ("Invoice and payment proof for the Pemesan").
