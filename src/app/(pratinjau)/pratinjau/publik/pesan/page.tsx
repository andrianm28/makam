/* PROTOTYPE, throwaway. Wizard Saat Duka: Pilih makam → Data & kirim. */
import { WizardSaatDuka } from "./wizard";

export default async function PesanPratinjau({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  return <WizardSaatDuka langkah={one("langkah") === "data" ? "data" : "pilih"} pilihan={one("pilihan")} lokasi={one("lokasi")} />;
}
