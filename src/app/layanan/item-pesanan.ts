/**
 * The `item` the two family-side Layanan order forms send (Lokasi Mitra, ticket 50; TPU, ticket 56), built from what
 * the family has filled in. One function for both forms, so the lookup can be wrong in one place only.
 *
 * The forms show one block per Layanan, and each block holds that Layanan's chosen variant, its target date and its
 * extra text. So the form keeps **three maps, each keyed by the Layanan's id** (never a variant's), and this is the
 * one place that reads them. Display and shaping only: whether a text is required, which dates are allowed and what
 * anything costs are the Layanan module's own, which refuses the order again where it is placed.
 */

/** The part of an offered Layanan the items need; `LayananTawarkan` and `LayananTpuTawarkan` both have it. */
export interface LayananDiForm {
  id: string;
  teksLabel: string | null;
  /** The earliest target date its lead time allows (WIB), which is the date sent while the family has chosen none. */
  targetPalingDini: string;
  varian: readonly { id: string }[];
}

/** What a family has filled in so far; each map is keyed by the **Layanan's** id. */
export interface IsianLayanan {
  /** The variant chosen for each Layanan ("" or absent: not ordered). */
  dipilih: Readonly<Record<string, string>>;
  /** The target date chosen for each Layanan ("" or absent: none chosen yet). */
  tanggal: Readonly<Record<string, string>>;
  /** The extra text typed for each Layanan, for the ones that ask for it. */
  teks: Readonly<Record<string, string>>;
}

export interface ItemPesananLayanan {
  layananVariantId: string;
  targetDate: string;
  teks: string | null;
}

/**
 * One item per chosen variant, in the order the family chose them (the order the price is asked in, so the
 * breakdown on the screen and the Tagihan's lines agree). The variant says which Layanan it belongs to, and that
 * Layanan's id, not the variant's, is the key of the date and the text the family entered for it.
 *
 * The date is the earliest the lead time allows while the family has chosen none, or has cleared the field again
 * (it then shows that date); the text is sent trimmed, and only for a Layanan that asks for one.
 */
export function itemPesananLayanan(layanan: readonly LayananDiForm[], isian: IsianLayanan): ItemPesananLayanan[] {
  return Object.values(isian.dipilih).flatMap((varianId) => {
    const grup = layanan.find((satu) => satu.varian.some((varian) => varian.id === varianId));
    if (!grup) return [];
    return [
      {
        layananVariantId: varianId,
        targetDate: isian.tanggal[grup.id] || grup.targetPalingDini,
        teks: grup.teksLabel ? isian.teks[grup.id]?.trim() || null : null,
      },
    ];
  });
}
