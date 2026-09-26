/* PROTOTYPE, throwaway. Wizard Terencana: Lokasi → Petak → Data & kirim. */
import { WizardTerencana } from "./wizard-terencana";

export default async function TerencanaPratinjau({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const langkah = one("langkah");
  return (
    <WizardTerencana
      langkah={langkah === "petak" || langkah === "data" ? langkah : "lokasi"}
      lokasi={one("lokasi")}
      blok={one("blok")}
      petak={one("petak")}
      kavling={one("kavling")}
    />
  );
}
