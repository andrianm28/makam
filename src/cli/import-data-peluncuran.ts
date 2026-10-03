/**
 * `npx tsx src/cli/import-data-peluncuran.ts --sumber <folder> [--tulis] [--izinkan-staging] [--izinkan-production]`:
 * imports the launch reference data from the template's CSV files. A dry run unless `--tulis`.
 */
import { cliFailure } from "./cli-failure";
import { importDataPeluncuranCommand } from "./import-data-peluncuran-command";

importDataPeluncuranCommand(process.argv.slice(2))
  .then(({ exitCode, output }) => {
    (exitCode === 0 ? console.log : console.error)(output);
    process.exit(exitCode);
  })
  .catch((error: unknown) => {
    console.error(`[import-data-peluncuran] Gagal: ${cliFailure(error)}`);
    process.exit(1);
  });
