import { redirect } from "next/navigation";
import { ListChecksIcon, PackageIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/makam/empty-state";
import { FormSection } from "@/components/makam/form-section";
import { PageHeader } from "@/components/makam/page-header";
import { authorize, layananKatalogResource } from "@/domain/identity";
import { buktiOf, jenisLayananValues, proofOf, type LayananTerbaca, type PaketLayanan } from "@/domain/layanan";
import { frekuensiLabels, jenisLayananLabels, proofLabels } from "@/lib/layanan-labels";
import { formatRupiah } from "@/lib/rupiah";
import { wibDateOf } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import {
  BuatPaketForm,
  HargaDkiForm,
  HapusLayananForm,
  HapusPaketForm,
  HapusVarianForm,
  TambahLayananForm,
  TambahVarianForm,
  TandaiBolehDiTpuForm,
  TarifMitraJasaForm,
  UbahLayananForm,
  UbahPaketForm,
} from "./layanan-forms";

/** One Pilihan of the catalog, as a Paket Layanan's item checkbox and a price book read it. */
interface Pilihan {
  id: string;
  label: string;
  layananId: string;
  layananName: string;
  variantName: string;
  bolehDiTpu: boolean;
}

/**
 * The kinds of Layanan the forms offer, each with the proof its kind requires,
 * built here on the server: a client component never imports a value from the
 * domain (that would pull the tables into the browser bundle).
 */
const jenisOptions = jenisLayananValues.map((value) => ({
  value,
  label: jenisLayananLabels[value],
  bukti: buktiOf(value),
  proofLabel: proofLabels(proofOf(value)),
}));

function pilihanOf(katalog: LayananTerbaca[]): Pilihan[] {
  return katalog.flatMap((layanan) =>
    layanan.varian.map((varian) => ({
      id: varian.id,
      label: `${layanan.name} — ${varian.name}`,
      layananId: layanan.id,
      layananName: layanan.name,
      variantName: varian.name,
      bolehDiTpu: varian.bolehDiTpu,
    })),
  );
}

/** Admin Platform keeps the one global Layanan catalog, its price books and the Paket Layanan. */
export default async function LayananPage() {
  const actor = await staffMenuActor("admin_platform");
  if (!authorize(actor, "layanan.kelola", layananKatalogResource()).allowed) redirect("/staf");
  const { layanan, tariffs, adapters } = serverRuntime();
  const now = adapters.clock.now();
  const today = wibDateOf(now);

  const [katalog, paket] = await Promise.all([layanan.katalog(), layanan.paket()]);
  const pilihan = pilihanOf(katalog);
  const hargaDki = new Map(
    await Promise.all(pilihan.map(async (one) => [one.id, await tariffs.hargaLayananDki(one.id, now)] as const)),
  );
  const tarifMitraJasa = new Map(
    await Promise.all(pilihan.map(async (one) => [one.id, await tariffs.mitraJasaRate(actor, one.id, now)] as const)),
  );

  return (
    <>
      <PageHeader
        title="Katalog Layanan"
        description="Satu daftar global untuk semua Lokasi Mitra dan TPU DKI. Harga sebuah Pilihan bukan milik katalog: setiap Lokasi Mitra punya tarifnya sendiri, TPU DKI punya satu harga yang sama di semua TPU, dan tarif Mitra.Jpa tidak pernah dilihat keluarga. Semuanya versi baru dengan tanggal berlaku, tidak pernah ditulis ulang."
      />

      <FormSection title="Tambah Layanan">
        <TambahLayananForm options={jenisOptions} />
      </FormSection>

      {katalog.length === 0 ? (
        <EmptyState icon={ListChecksIcon} title="Katalog masih kosong" description="Tambahkan Layanan pertama, satu Pilihan per baris." />
      ) : (
        katalog.map((layanan) => (
          <LayananCard
            key={layanan.id}
            today={today}
            layanan={layanan}
            hargaDki={hargaDki}
            tarifMitraJasa={tarifMitraJasa}
          />
        ))
      )}

      <FormSection title="Tambah Paket Layanan" description="Harga Paket bukan diisi di sini: ia jumlah harga isi Paket di tempat Paket itu ditawarkan.">
        <BuatPaketForm item={pilihan.map((one) => ({ id: one.id, label: one.label }))} />
      </FormSection>

      <PaketList paket={paket} item={pilihan.map((one) => ({ id: one.id, label: one.label }))} />
    </>
  );
}

/** One Layanan of the catalog: its fields, its Pilihan, and each Pilihan's two global price books. */
function LayananCard({
  today,
  layanan,
  hargaDki,
  tarifMitraJasa,
}: {
  today: string;
  layanan: LayananTerbaca;
  hargaDki: Map<string, { amount: number } | null>;
  tarifMitraJasa: Map<string, { amount: number } | null>;
}) {
  return (
    <section aria-labelledby={`layanan-${layanan.id}`}>
      <Card>
        <CardHeader>
          <CardTitle id={`layanan-${layanan.id}`}>{layanan.name}</CardTitle>
          <CardDescription>
            {layanan.description || "Tanpa keterangan."} · Bisa hari-H: {layanan.bisaHariH ? "ya" : "tidak"} · Boleh di petak kosong:{" "}
            {layanan.adaDiPetakKosong ? "ya" : "tidak"} · paling cepat {layanan.leadTimeDays} hari setelah dipesan
            {layanan.teksLabel ? ` · isian: ${layanan.teksLabel}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-small text-muted-foreground">
            {jenisLayananLabels[layanan.jenis]} · Bukti wajib: {proofLabels(layanan.proof)}
          </p>

          <details>
            <summary className="cursor-pointer text-sm font-medium">Ubah Layanan ini</summary>
            <div className="mt-3">
              <UbahLayananForm
                options={jenisOptions}
                layanan={{
                  id: layanan.id,
                  name: layanan.name,
                  description: layanan.description,
                  jenis: layanan.jenis,
                  leadTimeDays: layanan.leadTimeDays,
                  bisaHariH: layanan.bisaHariH,
                  adaDiPetakKosong: layanan.adaDiPetakKosong,
                  teksLabel: layanan.teksLabel,
                }}
              />
            </div>
          </details>

          <TambahVarianForm layananId={layanan.id} />

          {layanan.varian.map((varian) => (
            <div key={varian.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{varian.name}</p>
                <p className="text-small text-muted-foreground">
                  Harga TPU DKI {hargaDki.get(varian.id) ? formatRupiah(hargaDki.get(varian.id)!.amount) : "belum ada"} · Tarif Mitra Jasa{" "}
                  {tarifMitraJasa.get(varian.id) ? formatRupiah(tarifMitraJasa.get(varian.id)!.amount) : "belum ada"}
                </p>
              </div>
              <p className="text-small">{varian.bolehDiTpu ? "Boleh di TPU DKI." : "Belum ditandai boleh di TPU DKI."}</p>

              <details>
                <summary className="cursor-pointer text-sm font-medium">Harga di TPU DKI</summary>
                <div className="mt-3">
                  <HargaDkiForm variantId={varian.id} today={today} />
                </div>
              </details>

              <details>
                <summary className="cursor-pointer text-sm font-medium">Tarif Mitra Jasa (tidak pernah dilihat keluarga)</summary>
                <div className="mt-3">
                  <TarifMitraJasaForm variantId={varian.id} today={today} />
                </div>
              </details>

              <TandaiBolehDiTpuForm variantId={varian.id} boleh={varian.bolehDiTpu} />
              <HapusVarianForm variantId={varian.id} name={`${layanan.name} — ${varian.name}`} />
            </div>
          ))}

          <HapusLayananForm layananId={layanan.id} name={layanan.name} />
        </CardContent>
      </Card>
    </section>
  );
}

/** Every Paket Layanan, with the form that changes or removes it. */
function PaketList({ paket, item }: { paket: PaketLayanan[]; item: readonly { id: string; label: string }[] }) {
  if (paket.length === 0) {
    return <EmptyState icon={PackageIcon} title="Belum ada Paket Layanan" description="Paket Layanan adalah kumpulan Layanan dengan frekuensi: sekali, bulanan, 3-bulanan atau tahunan." />;
  }
  return (
    <section aria-labelledby="paket-layanan" className="flex flex-col gap-4">
      <h2 id="paket-layanan" className="text-lg font-semibold">
        Paket Layanan
      </h2>
      {paket.map((satu) => (
        <Card key={satu.id}>
          <CardHeader>
            <CardTitle>{satu.name}</CardTitle>
            <CardDescription>
              {satu.description || "Tanpa keterangan."} · {frekuensiLabels[satu.frekuensi]} · Isi:{" "}
              {satu.item.map((entry) => `${entry.namaLayanan} — ${entry.name}`).join(", ")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <details>
              <summary className="cursor-pointer text-sm font-medium">Ubah Paket ini</summary>
              <div className="mt-3">
                <UbahPaketForm
                  paket={{
                    id: satu.id,
                    name: satu.name,
                    description: satu.description,
                    frekuensi: satu.frekuensi,
                    itemIds: satu.item.map((entry) => entry.id),
                  }}
                  item={item}
                />
              </div>
            </details>
            <HapusPaketForm paketId={satu.id} name={satu.name} />
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
