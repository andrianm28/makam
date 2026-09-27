/**
 * `npx tsx src/cli/seed-saat-duka.ts` (dev) or, in a local stack's image,
 * `node dist/seed-saat-duka.mjs`: issues an example Lokasi Mitra the Saat Duka
 * wizard can offer on a development or test stack. Refused on staging and
 * production.
 */
import { cliFailure } from "./cli-failure";
import { seedSaatDukaCommand } from "./seed-saat-duka-command";

seedSaatDukaCommand(process.argv.slice(2))
  .then(({ exitCode, output }) => {
    (exitCode === 0 ? console.log : console.error)(`[seed-saat-duka] ${output}`);
    process.exit(exitCode);
  })
  .catch((error: unknown) => {
    console.error(`[seed-saat-duka] ${cliFailure(error)}`);
    process.exit(1);
  });
