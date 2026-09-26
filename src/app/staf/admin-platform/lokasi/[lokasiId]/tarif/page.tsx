import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { JenisMakamPrice, StaffTariffReads } from "@/domain/tariffs";
import { formatTanggal, formatWib, wibDateOf } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { formatRupiah } from "@/lib/rupiah";
import { formatTenure } from "../../../tarif/format";
import {
  BiayaPemakamanForm,
  JenisMakamTariffForm,
  NewJenisMakamForm,
  TariffsCheckedForm,
} from "../../../tarif/tarif-forms";

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <Card>
        <CardHeader>
          <CardTitle id={id}>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">{children}</CardContent>
      </Card>
    </section>
  );
}

/** The all-in Saat Duka total of a Jenis Makam now, as the Pemesan will see it once the Lokasi is listed (Harga Hak Pakai + Biaya Pemakaman + Biaya Layanan Platform). */
async function saatDukaTotal(tariffs: StaffTariffReads, lokasiId: string, jenisMakamId: string, now: Date): Promise<string> {
  const quote = await tariffs.quote(
    [
      { kind: "harga_hak_pakai", jenisMakamId },
      { kind: "biaya_pemakaman", lokasiId, tumpang: false },
    ],
    now,
  );
  if (!quote.ok) return "belum bisa dihitung (tarif belum lengkap)";
  const scheduled = quote.scheduledChange
    ? ` · Harga baru mulai ${formatTanggal(quote.scheduledChange.effectiveOn)}: ${formatRupiah(quote.scheduledChange.total)}`
    : "";
  return `${formatRupiah(quote.total)}${scheduled}`;
}

function JenisMakamSummary({ jenisMakam }: { jenisMakam: JenisMakamPrice }) {
  const { inForce, scheduledChange } = jenisMakam;
  const describe = (version: NonNullable<JenisMakamPrice["inForce"]>) =>
    `Harga Hak Pakai ${formatRupiah(version.hargaHakPakai)} · ${formatTenure(version.tenure)}` +
    (version.hargaPerpanjangan === null ? "" : ` · Perpanjangan ${formatRupiah(version.hargaPerpanjangan)} per masa`);
  return (
    <>
      <p>{inForce ? `${describe(inForce)} · Harga berlaku sejak ${formatTanggal(inForce.effectiveOn)}` : "Belum ada tarif yang berlaku."}</p>
      {scheduledChange ? (
        <p>
          Harga baru mulai {formatTanggal(scheduledChange.effectiveOn)}: {describe(scheduledChange)}
        </p>
      ) : null}
    </>
  );
}

/** Admin Platform: a Lokasi Mitra's Jenis Makam, their tariffs, its Biaya Pemakaman and the "tarif diperiksa" mark. */
export default async function TarifLokasiPage({ params }: PageProps<"/staf/admin-platform/lokasi/[lokasiId]/tarif">) {
  const actor = await staffMenuActor("admin_platform");
  const { lokasiId } = await params;
  const { lokasi, adapters } = serverRuntime();
  const read = await lokasi.lokasiMitra(actor, lokasiId);
  if (!read.ok) {
    if (read.reason === "tidak_ditemukan") notFound();
    redirect("/staf");
  }
  const lokasiMitra = read.lokasiMitra;
  // Staff reads: a Lokasi still Belum Tayang is read here, before it is listed.
  const tariffs = serverRuntime().tariffs.asStaff(actor);
  const now = adapters.clock.now();
  const today = wibDateOf(now);
  const [priced, checked, biayaPemakamanHistory] = await Promise.all([
    tariffs.lokasiTariffs(lokasiMitra.id, now),
    tariffs.tariffsChecked(lokasiMitra.id),
    tariffs.biayaPemakamanHistory(lokasiMitra.id),
  ]);
  const totals = await Promise.all(priced.jenisMakam.map((one) => saatDukaTotal(tariffs, lokasiMitra.id, one.id, now)));
  const { inForce: biaya, scheduledChange: biayaBaru } = priced.biayaPemakaman;
  const describeBiaya = (version: NonNullable<typeof biaya>) =>
    `${formatRupiah(version.biayaPemakaman)} · tumpang ${
      version.biayaPemakamanTumpang === null ? "sama" : formatRupiah(version.biayaPemakamanTumpang)
    }`;

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href={`/staf/admin-platform/lokasi/${lokasiMitra.id}`} className="text-sm underline underline-offset-4">
          {lokasiMitra.name}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Tarif</h1>
        <p className="text-sm text-muted-foreground">
          Hanya Admin Platform yang memasukkan tarif, sesuai perjanjian. Setiap perubahan adalah versi baru dengan tanggal berlaku;
          versi lama tidak pernah diubah atau dihapus, dan setiap perubahan tercatat di Audit Log Lokasi ini.
        </p>
      </div>

      <Section id="diperiksa" title="Tarif diperiksa" description="Syarat tayang: tarif sudah dicocokkan dengan perjanjian.">
        {checked ? (
          <p className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Sudah diperiksa</Badge>
            {formatWib(checked.checkedAt)}
            {checked.changedSinceCheck ? <Badge variant="destructive">Ada tarif baru sejak diperiksa</Badge> : null}
          </p>
        ) : (
          <p className="text-muted-foreground">Belum diperiksa.</p>
        )}
        <TariffsCheckedForm lokasiId={lokasiMitra.id} />
      </Section>

      <Section id="jenis-makam" title="Jenis Makam" description="Harga Hak Pakai, masa Hak Pakai dan harga Perpanjangan per Jenis Makam.">
        {priced.jenisMakam.length === 0 ? <p className="text-muted-foreground">Belum ada Jenis Makam.</p> : null}
        {priced.jenisMakam.map((one, index) => (
          <article key={one.id} className="flex flex-col gap-2 border-t pt-4 first:border-t-0 first:pt-0">
            <h3 className="font-medium">
              {one.name}
              {one.description ? <span className="font-normal text-muted-foreground"> · {one.description}</span> : null}
            </h3>
            <JenisMakamSummary jenisMakam={one} />
            <p>Total semua biaya Saat Duka saat ini: {totals[index]}</p>
            <details>
              <summary className="cursor-pointer">Tarif baru untuk {one.name}</summary>
              <div className="mt-3">
                <JenisMakamTariffForm lokasiId={lokasiMitra.id} jenisMakamId={one.id} today={today} />
              </div>
            </details>
          </article>
        ))}
        <details>
          <summary className="cursor-pointer font-medium">Tambah Jenis Makam</summary>
          <div className="mt-3">
            <NewJenisMakamForm lokasiId={lokasiMitra.id} today={today} />
          </div>
        </details>
      </Section>

      <Section id="biaya-pemakaman" title="Biaya Pemakaman" description="Dikenakan pada setiap Pemakaman di Lokasi ini, termasuk di bawah Hak Pakai yang sudah ada.">
        <p>{biaya ? `${describeBiaya(biaya)} · Harga berlaku sejak ${formatTanggal(biaya.effectiveOn)}` : "Belum ada Biaya Pemakaman yang berlaku."}</p>
        {biayaBaru ? (
          <p>
            Harga baru mulai {formatTanggal(biayaBaru.effectiveOn)}: {describeBiaya(biayaBaru)}
          </p>
        ) : null}
        <BiayaPemakamanForm lokasiId={lokasiMitra.id} today={today} />
        {biayaPemakamanHistory.length > 0 ? (
          <details>
            <summary className="cursor-pointer">Riwayat versi ({biayaPemakamanHistory.length})</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {biayaPemakamanHistory.map((version) => (
                <li key={version.seq}>
                  {describeBiaya(version)} berlaku {formatTanggal(version.effectiveOn)} · dicatat {formatWib(version.enteredAt)}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Section>
    </>
  );
}
