/**
 * `npx tsx src/cli/seed-tagihan.ts` (dev) or, in a local stack's image,
 * `node dist/seed-tagihan.mjs`: issues an example Tagihan on a development or
 * test stack. Refused on staging and production.
 */
import { cliFailure } from "./cli-failure";
import { seedTagihanCommand } from "./seed-tagihan-command";

seedTagihanCommand(process.argv.slice(2))
  .then(({ exitCode, output }) => {
    (exitCode === 0 ? console.log : console.error)(`[seed-tagihan] ${output}`);
    process.exit(exitCode);
  })
  .catch((error: unknown) => {
    console.error(`[seed-tagihan] ${cliFailure(error)}`);
    process.exit(1);
  });
