/**
 * `npx tsx src/cli/seed-contoh-publik.ts` (dev) or, in a local stack's image,
 * `node dist/seed-contoh-publik.mjs`: issues the public-site prototype's five
 * example Lokasi Mitra on a development or test stack. Refused on staging and
 * production.
 */
import { cliFailure } from "./cli-failure";
import { seedContohPublikCommand } from "./seed-contoh-publik-command";

seedContohPublikCommand(process.argv.slice(2))
  .then(({ exitCode, output }) => {
    (exitCode === 0 ? console.log : console.error)(`[seed-contoh-publik] ${output}`);
    process.exit(exitCode);
  })
  .catch((error: unknown) => {
    console.error(`[seed-contoh-publik] ${cliFailure(error)}`);
    process.exit(1);
  });
