import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { StatusBadge } from "@/components/makam/status-badge";
import { authorize, pemesananResource } from "@/domain/identity";
import type { PermintaanHakPakai } from "@/domain/pemesanan";
import { artiStatusPermintaanHakPakai, namaPermintaanHakPakai, statusPermintaanHakPakaiBadge } from "@/lib/permintaan-hak-pakai-labels";
import { formatTanggalJam } from "@/lib/time/jakarta";
import { currentActor } from "@/server/session";
import { serverRuntime } from "@/server/runtime";
import { AjukanUlangForm, BatalkanForm, GantiForm, KembalikanForm } from "./permintaan-forms";

export const metadata: Metadata = {
  title: "Pengembalian atau Ganti Pemegang Hak · Makam.co.id",
  // The address names one Hak Pakai: never indexed, never followed.
  robots: { index: false, follow: false },
};

const paramsSchema = z.object({ hakPakaiId: z.uuid() });

/**
 * "Kembalikan Hak Pakai" and "Ajukan Ganti Pemegang Hak" of one Hak Pakai (spec, stories 103 and 104; ticket 39),
 * reached from Akun Saya's Makam tab: the request and where it stands once one is filed, and the two forms while
 * the Hak Pakai can still be given back or handed over. Only the Pemegang Hak sees anything here (the Makam tab's own
 * match by Email Terverifikasi); everybody else is told nothing found. Every "cannot" is the Pemesanan module's.
 */
export default async function PermintaanHakPakaiPage({ params }: PageProps<"/permintaan-hak-pakai/[hakPakaiId]">) {
  const id = paramsSchema.safeParse(await params);
  if (!id.success) notFound();
  const actor = await currentActor();
  if (!actor) redirect("/masuk");
  if (!authorize(actor, "permintaan_hak_pakai.ajukan", pemesananResource(actor.accountId)).allowed) notFound();
  const { inventory, pemesanan, lokasi } = serverRuntime();
  const makam = (await inventory.makamKeluargaSaya({ email: actor.email })).find((satu) => satu.hakPakaiId === id.data.hakPakaiId);
  if (!makam) notFound();
  const permintaan = await pemesanan.permintaanHakPakaiTerakhir(makam.hakPakaiId);
  const terbuka = permintaan !== null && (permintaan.status === "diajukan" || permintaan.status === "perlu_perbaikan");
  const aktif = makam.status === "aktif";
  const nomor = makam.nomorKavling ?? makam.petak.map((petak) => petak.nomorMakam).join(", ");
  const aturan = await lokasi.aturanGantiPemegangHak(makam.lokasiId);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-(--page-gutter) py-10 md:py-14">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-title-1 font-semibold tracking-tight text-balance">Pengembalian atau Ganti Pemegang Hak</h1>
        <p className="text-body-lg text-muted-foreground" data-testid="permintaan-petak">
          Makam {nomor}
        </p>
      </header>

      {permintaan ? <StatusPermintaan hakPakaiId={makam.hakPakaiId} permintaan={permintaan} terbuka={terbuka} /> : null}

      {aktif && !terbuka ? (
        <>
          {makam.pemakaman.length === 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-title-3 text-foreground">Kembalikan Hak Pakai</h2>
              <p className="text-small text-muted-foreground">
                Untuk petak yang belum dipakai. Kalau Lokasi Mitra menyetujui, Hak Pakai berakhir dan petaknya kembali tersedia. Uang yang pernah dibayar tidak
                dikembalikan lewat Makam.co.id: kompensasi disepakati langsung dengan Lokasi Mitra, sebelum Anda mengajukan.
              </p>
              <KembalikanForm hakPakaiId={makam.hakPakaiId} />
            </section>
          ) : null}
          <section className="flex flex-col gap-3">
            <h2 className="text-title-3 text-foreground">Ajukan Ganti Pemegang Hak</h2>
            <p className="text-small text-muted-foreground">
              Hak Pakai pindah ke Pemegang Hak baru dan muncul di Makam Keluarga miliknya (dicocokkan lewat email). Pemegang sebelumnya tetap tercatat di riwayat.
              Biaya penggantian, bila Lokasi Mitra memungut, dibayar langsung kepada Lokasi Mitra
              {aturan && aturan.gantiPemegangHakFee > 0 ? ` (Rp ${aturan.gantiPemegangHakFee.toLocaleString("id-ID")})` : ""}.
            </p>
            <p className="rounded-xl bg-info-soft px-4 py-3 text-small text-info-soft-foreground" data-testid="ahli-waris">
              Pemegang Hak sudah meninggal? Ahli waris tidak perlu mengajukan permintaan ini: gunakan{" "}
              <Link href="/makam-keluarga" className="font-medium underline underline-offset-4">
                pencarian Makam Keluarga
              </Link>{" "}
              untuk menemukan makam dan menghubungi Lokasi Mitra.
            </p>
            <GantiForm hakPakaiId={makam.hakPakaiId} jualDiizinkan={aturan?.saleTransfersAllowed ?? false} />
          </section>
        </>
      ) : null}

      <Link href="/akun/makam" className="text-body font-medium text-brand underline underline-offset-4">
        Kembali ke Makam Keluarga
      </Link>
    </main>
  );
}

function StatusPermintaan({ hakPakaiId, permintaan, terbuka }: { hakPakaiId: string; permintaan: PermintaanHakPakai; terbuka: boolean }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5" data-testid="permintaan-status">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-title-3 text-foreground">{namaPermintaanHakPakai(permintaan.jenis)}</h2>
        <StatusBadge status={statusPermintaanHakPakaiBadge[permintaan.status]} />
      </div>
      <p className="text-body text-muted-foreground">{artiStatusPermintaanHakPakai(permintaan.jenis, permintaan.status)}</p>
      <dl className="flex flex-col gap-2 text-body">
        <Baris label="Diajukan" value={formatTanggalJam(permintaan.diajukanPada)} />
        {permintaan.status === "diajukan" && permintaan.tenggatPada ? <Baris label="Dijawab paling lambat" value={formatTanggalJam(permintaan.tenggatPada)} /> : null}
        {permintaan.pemegangBaru ? <Baris label="Pemegang Hak baru" value={permintaan.pemegangBaru.name} /> : null}
        {permintaan.alasanKeputusan ? <Baris label={permintaan.status === "perlu_perbaikan" ? "Yang diminta Lokasi Mitra" : "Alasan Lokasi Mitra"} value={permintaan.alasanKeputusan} /> : null}
      </dl>
      {permintaan.status === "perlu_perbaikan" ? <AjukanUlangForm hakPakaiId={hakPakaiId} id={permintaan.id} /> : null}
      {terbuka ? <BatalkanForm hakPakaiId={hakPakaiId} id={permintaan.id} /> : null}
    </section>
  );
}

function Baris({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}
