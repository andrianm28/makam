/**
 * `npx tsx src/cli/data-contoh.ts <tanam --set rilis1 | cabut | status>` (dev) or, in the
 * image, `node dist/data-contoh.mjs ...` (ticket 109): plants, lists and retires the
 * clearly marked "(Contoh)" example records a beta shows. A dry run unless `--tulis`;
 * staging needs `--izinkan-staging`, production `--izinkan-production`.
 */
import { cliFailure } from "./cli-failure";
import { dataContohCommand } from "./data-contoh-command";

dataContohCommand(process.argv.slice(2))
  .then(({ exitCode, output }) => {
    (exitCode === 0 ? console.log : console.error)(`[data-contoh] ${output}`);
    process.exit(exitCode);
  })
  .catch((error: unknown) => {
    console.error(`[data-contoh] ${cliFailure(error)}`);
    process.exit(1);
  });
