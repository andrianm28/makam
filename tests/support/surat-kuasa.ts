import { FakePdfRenderer } from "@/adapters/memory";

/** What Pengurusan needs to make a Surat Kuasa PDF: a recording PdfRenderer and a stand-in for the signed render page's address. */
export function suratKuasaDeps() {
  const pdf = new FakePdfRenderer();
  return { pdf, suratKuasaPageUrl: (nomor: string, sampai: Date) => `http://render.test/pengurusan/${nomor}/surat-kuasa/render?sampai=${sampai.getTime()}` };
}
