import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { FormSection } from "@/components/makam/form-section";
import { PageHeader } from "@/components/makam/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tagihanStatusText } from "@/lib/billing-labels";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";

export const metadata: Metadata = { title: "Tagihan · Area Staf" };

const querySchema = z.string().trim().max(40);

/**
 * How Admin Platform opens a Tagihan by hand (spec, Billing > Payment; stories
 * 163, 164; ticket 30): search by Nomor Tagihan or Nomor Pemesanan, then open
 * it to record a payment, set a Harga Khusus or reverse a direct payment. A
 * plain GET form and a read through Billing: nothing here decides anything.
 */
export default async function TagihanCariPage({ searchParams }: PageProps<"/staf/admin-platform/tagihan">) {
  await staffMenuActor("admin_platform");
  const raw = (await searchParams).q;
  const q = querySchema.safeParse(Array.isArray(raw) ? raw[0] : (raw ?? "")).data ?? "";
  const hasil = q === "" ? null : await serverRuntime().billing.cariTagihan(q);

  return (
    <>
      <PageHeader
        title="Tagihan"
        description="Cari dari nomor Tagihan (TGH/2026/000123) atau nomor pesanan (MKM-2026-000123), lalu buka untuk mencatat pembayaran manual atau Harga Khusus."
      />

      <FormSection title="Cari">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <label htmlFor="q" className="text-body font-medium">
              Nomor Tagihan atau nomor pesanan
            </label>
            <Input id="q" name="q" defaultValue={q} minLength={3} maxLength={40} placeholder="MKM-2026-000123" required />
          </div>
          <Button type="submit">Cari</Button>
        </form>
      </FormSection>

      {hasil === null ? null : (
        <FormSection
          title="Hasil"
          description={hasil.length === 0 ? "Tidak ada Tagihan yang cocok. Tulis paling sedikit 3 karakter awal nomornya." : undefined}
        >
          {hasil.length === 0 ? null : (
            <ul className="flex flex-col divide-y text-body">
              {hasil.map((tagihan) => (
                <li key={tagihan.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-mono font-semibold text-foreground">{tagihan.nomorTagihan}</span>
                    {tagihan.nomorPemesanan ? ` · ${tagihan.nomorPemesanan}` : ""} · {tagihan.addresseeName} ·{" "}
                    {formatRupiah(tagihan.total)} · {tagihanStatusText(tagihan.status)}
                    <span className="block text-small text-muted-foreground">Terbit {formatTanggalJam(tagihan.issuedAt)}</span>
                  </span>
                  <Link href={`/staf/admin-platform/tagihan/${tagihan.id}`} className="font-medium text-brand underline underline-offset-4">
                    Buka
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </FormSection>
      )}
    </>
  );
}
