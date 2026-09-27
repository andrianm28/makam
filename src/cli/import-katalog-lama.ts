/**
 * `npx tsx src/cli/import-katalog-lama.ts --sumber <berkas.json> [--tulis] [--izinkan-staging]`:
 * imports a cemetery catalog export into a development or test stack, or into
 * staging under the named allowance (never production). A dry run unless
 * `--tulis`. Never opens the source's database, only reads the export file.
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
