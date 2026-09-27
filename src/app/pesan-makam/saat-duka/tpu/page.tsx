import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DataTpu, type OpsiDokumen } from "./data-tpu";
import { tpuKartuView } from "../tampilan";
import { kirimKodeMasuk } from "@/app/masuk/actions";
import { satuNilai } from "@/lib/search-param";
import { serverRuntime } from "@/server/runtime";
import { currentActor } from "@/server/session";

export const metadata: Metadata = {
  title: "Pengurusan di TPU DKI | Pesan Makam Saat Duka | Makam.co.id",
  robots: { index: false, follow: false },
};

/**
 * Screen 2 of the Saat Duka wizard for a TPU, "Data & kirim" (spec, stories
 * 68–72): the chosen TPU with the price its order carries, the Almarhum, how
 * the grave is made, the two eligibility questions, the Pemegang Hak for the
 * IPTM, the two document checklists, and the Kode Masuk that proves the email at
 * Kirim (skipped for a signed-in Pemesan).
 *
 * A TPU that is not taking new plots is not on the list, so it names no screen:
 * the wizard's first step would never carry its id.
 */
export default async function DataTpuPage({ searchParams }: PageProps<"/pesan-makam/saat-duka/tpu">) {
  const tpuId = satuNilai((await searchParams).tpuId);
  const { pengurusan, operatorSettings } = serverRuntime();
  const actor = await currentActor();

  // The card is priced again by the module, so the total a family reads here is
  // the one its order will carry. A URL without an id names no TPU at all.
  const [daftar, pengaturan] = await Promise.all([
    tpuId ? pengurusan.pilihanSaatDukaTpu({ tpuId }) : Promise.resolve([]),
    operatorSettings.current(),
  ]);
  const kartu = daftar[0];
  if (!kartu) notFound();

  // Every set the answers can produce, built by the same function the order is
  // given them, so the checklist a family reads is the checklist the order keeps.
  const opsiDokumen: OpsiDokumen[] = (["baru", "tumpang"] as const).flatMap((jenis) =>
    [true, false].map((wafatDiJakarta) => {
      const { pemakaman, pengajuan } = pengurusan.daftarDokumen({ jenis, kelayakan: { ktpDki: true, wafatDiJakarta } });
      return { jenis, wafatDiJakarta, pemakaman, pengajuan };
    }),
  );

  return (
    <DataTpu
      draft={{ tpuId: kartu.tpu.id, email: actor?.email ?? "", pemesanName: "", phoneNumber: "" }}
      tpu={tpuKartuView(kartu)}
      opsiDokumen={opsiDokumen}
      sudahMasuk={actor !== null}
      mintaKodeMasuk={kirimKodeMasuk}
      csContact={pengaturan ? { whatsApp: pengaturan.csWhatsApp, replyHours: pengaturan.csReplyHours } : null}
    />
  );
}
