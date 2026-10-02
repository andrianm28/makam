import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/makam/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/makam/status-badge";
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggal, formatTanggalJam } from "@/lib/time/jakarta";
import { serverRuntime } from "@/server/runtime";
import { staffMenuActor } from "@/server/staff-area";
import { ConfirmTpuForms } from "./konfirmasi-forms";
import { LangkahPengajuanForm, SuratPengantarForm, TolakPtspForm, type LangkahPengajuan } from "./pengajuan-forms";

/** The one filing step each status is waiting on (spec, Pengurusan); none from IPTM Terbit or when the order ended. */
const LANGKAH: Partial<Record<string, LangkahPengajuan>> = {
  dikonfirmasi: "catat_dimakamkan",
  dimakamkan: "periksa_dokumen",
  dokumen_lengkap: "ajukan_iptm",
  iptm_diajukan: "terbitkan_iptm",
};

/**
 * A filing-only Pengurusan IPTM (ticket 47) starts Dimakamkan, is filed once its Tagihan is Lunas (Diproses) and again,
 * at no charge, after a fixable PTSP rejection (Perlu Perbaikan); it waits on the family while Menunggu Pembayaran.
 */
const LANGKAH_BERKAS: Partial<Record<string, LangkahPengajuan>> = {
  dimakamkan: "periksa_dokumen",
  diproses: "ajukan_iptm",
  perlu_perbaikan: "ajukan_iptm",
  iptm_diajukan: "terbitkan_iptm",
};

/**
 * Admin Platform's screen for one Saat Duka TPU order, the page the Antrean's
 * Tier 1 "Konfirmasi TPU Saat Duka" row links to (ticket 45). It shows what the
 * family is waiting on, and the two things Admin Platform has to supply: the
 * burial agreed with the TPU with its office contact, and the Petugas who fetches
 * the surat pengantar. Confirming issues the pay-after Tagihan and creates that
 * Tugas, in one transaction inside the module.
 */
export default async function PengurusanTpuPage({ params }: PageProps<"/staf/admin-platform/pengurusan/[nomor]">) {
  const actor = await staffMenuActor("admin_platform");
  const { pengurusan, identity, lokasi } = serverRuntime();
  const nomor = (await params).nomor;
  const [order, staffAccounts, semuaTpu] = await Promise.all([
    pengurusan.orderForStaff(actor, nomor),
    identity.staffAccounts(),
    lokasi.publicTpuDkiList({}),
  ]);
  if (!order) notFound();
  const berkas = order.kind === "pengurusan_iptm";
  const langkah = (berkas ? LANGKAH_BERKAS : LANGKAH)[order.status];
  const petugas = staffAccounts
    .filter((account) => account.roles.includes("petugas_lapangan") && !account.deactivated)
    .map((account) => ({ accountId: account.accountId, name: account.name || account.email || account.accountId }));
  // Every TPU the list still offers, so an alternative is picked from the same
  // list the family was offered.
  const pilihanTpuLain = semuaTpu.filter((satu) => satu.newPlot && satu.id !== order.tpu.id);

  return (
    <>
      <PageHeader
        title={`Pengurusan ${order.nomor}`}
        description="Konfirmasi pemakaman yang sudah disepakati dengan TPU, lalu terbitkan Tagihan dan tugas ambil surat pengantar."
      />

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>
            Diajukan {formatTanggalJam(order.diajukanAt)}
            {order.konfirmasiDueAt
              ? ` · harus dikonfirmasi paling lambat ${formatTanggalJam(order.konfirmasiDueAt)}`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <StatusBadge status={statusBadge(order.status)} />
          <dl className="grid gap-2 text-body sm:grid-cols-2">
            <Baris label="TPU" value={`${order.tpu.name} · ${order.tpu.address}`} />
            <Baris label="Almarhum" value={`${order.almarhum.name}, wafat ${formatTanggal(order.almarhum.tanggalWafat)}`} />
            <Baris
              label="Pemesan"
              value={`${order.pemesan.name}${order.pemesan.email ? ` · ${order.pemesan.email}` : ""}`}
            />
            <Baris
              label="Pemegang Hak"
              value={`${order.pemegangHak.name}${order.pemegangHak.phoneNumber ? ` · ${order.pemegangHak.phoneNumber}` : ""}`}
            />
            <Baris label="Jenis pemakaman" value={order.jenisPenguburan === "tumpang" ? "Tumpang" : "Makam baru"} />
            {order.pemakamanAt ? <Baris label="Pemakaman disepakati" value={formatTanggalJam(order.pemakamanAt)} /> : null}
            {order.adminPlatform ? <Baris label="Ditangani Admin Platform" value={order.adminPlatform.name} /> : null}
            {order.tawaran ? <Baris label="TPU lain ditawarkan" value={`${order.tawaran.tpu.name} · ${order.tawaran.alasan}`} /> : null}
          </dl>
          {order.harga ? (
            <ul className="flex flex-col gap-1 text-small text-muted-foreground">
              {order.harga.map((line) => (
                <li key={line.label} className="flex justify-between gap-2">
                  <span>{line.label}</span>
                  <span>{formatRupiah(line.amount)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      {langkah || order.status === "iptm_terbit" ? (
        <Card>
          <CardHeader>
            <CardTitle>Sudah dikonfirmasi</CardTitle>
            <CardDescription>
              {order.tagihan
                ? `Tagihan ${order.tagihan.nomor} terbit dan jatuh tempo ${formatTanggalJam(order.tagihan.dueAt)}.`
                : "Pengurusan ini sudah dikonfirmasi."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {order.tagihan ? (
              <p className="text-body">
                Total {formatRupiah(order.tagihan.total)}.{" "}
                <Link href={`/staf/admin-platform/tagihan/${order.tagihan.id}`} className="font-medium text-brand underline underline-offset-4">
                  Buka Tagihan
                </Link>
              </p>
            ) : null}
            {order.catatanKonfirmasi ? <p className="text-body text-muted-foreground">{order.catatanKonfirmasi}</p> : null}
          </CardContent>
        </Card>
      ) : order.status === "dibatalkan" || berkas ? null : (
        <ConfirmTpuForms
          nomor={order.nomor}
          petugas={petugas}
          tpuLain={pilihanTpuLain.map((satu) => ({ id: satu.id, name: satu.name }))}
          tawaran={order.tawaran}
        />
      )}
      {langkah ? (
        <>
          <LangkahPengajuanForm
            nomor={order.nomor}
            langkah={langkah}
            petugas={petugas}
            perluBlokNomor={order.jenisPenguburan !== "tumpang"}
          />
          {order.status !== "dikonfirmasi" ? (
            <p className="text-small text-muted-foreground">
              Dokumen: {order.pengajuan.kurang.length > 0 ? `masih kurang ${order.pengajuan.kurang.join(", ")}` : "semua sudah diunggah"}.{" "}
              <Link href={`/staf/admin-platform/pengurusan/${order.nomor}/surat-kuasa`} className="font-medium text-brand underline underline-offset-4">
                Surat Kuasa
              </Link>
            </p>
          ) : null}
        </>
      ) : null}
      {berkas && (order.status === "menunggu_pembayaran" || order.status === "diproses") ? (
        order.status === "diproses" ? (
          <SuratPengantarForm nomor={order.nomor} petugas={petugas} />
        ) : (
          <p className="text-small text-muted-foreground">
            Menunggu pembayaran Tagihan{order.tagihan ? ` ${order.tagihan.nomor}, jatuh tempo ${formatTanggalJam(order.tagihan.dueAt)}` : ""}. Tugas ambil surat pengantar dibuat setelah Lunas.
          </p>
        )
      ) : null}
      {order.status === "iptm_diajukan" ? (
        <TolakPtspForm nomor={order.nomor} dokumen={order.dokumen.pengajuan.map((dokumen) => dokumen.nama)} bisaFinal={berkas} />
      ) : null}
      {order.status === "ditolak" && order.alasan ? <p className="text-body">Ditolak PTSP: {order.alasan}</p> : null}
      {order.status === "perlu_perbaikan" && order.alasan ? <p className="text-body">Perlu Perbaikan: {order.alasan}</p> : null}
    </>
  );
}

function statusBadge(status: string): "diajukan" | "dikonfirmasi" | "dimakamkan" | "dokumen_lengkap" | "iptm_diajukan" | "iptm_terbit" | "dibatalkan" | "ditolak" {
  switch (status) {
    case "dikonfirmasi":
    case "dimakamkan":
    case "dokumen_lengkap":
    case "iptm_diajukan":
    case "iptm_terbit":
    case "dibatalkan":
    case "ditolak":
      return status;
    default:
      return "diajukan";
  }
}

function Baris({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}
