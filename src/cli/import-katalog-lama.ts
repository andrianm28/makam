/**
 * `npx tsx src/cli/import-katalog-lama.ts --sumber <berkas.json> [--tulis]`
 * (dev): imports the old Laravel app's cemetery catalog into a development or
 * test stack. A dry run unless `--tulis`; refused on staging and production.
 * Never opens the old app's database, only reads the catalog export file.
 */
import { cliFailure } from "./cli-failure";
import { importKatalogLamaCommand } from "./import-katalog-lama-command";

importKatalogLamaCommand(process.argv.slice(2))
  .then(({ exitCode, output }) => {
    (exitCode === 0 ? console.log : console.error)(output);
    process.exit(exitCode);
  })
  .catch((error: unknown) => {
    console.error(`[import-katalog-lama] Gagal: ${cliFailure(error)}`);
    process.exit(1);
  });
