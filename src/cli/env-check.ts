/**
 * `node dist/env-check.mjs <APP_ENV>` (in the image) or `npm run env-check -- <APP_ENV>`:
 * checks the process environment against the app's own env schema and prints
 * the names of anything missing or malformed, never a value. Run by
 * deploy/bin/makam-preflight; see docs/ops/runbook.md, "Production preflight".
 */
import { cliFailure } from "./cli-failure";
import { envCheckCommand } from "./env-check-command";

envCheckCommand(process.argv.slice(2))
  .then(({ exitCode, output }) => {
    (exitCode === 0 ? console.log : console.error)(`[env-check] ${output}`);
    process.exit(exitCode);
  })
  .catch((error: unknown) => {
    console.error(`[env-check] ${cliFailure(error)}`);
    process.exit(1);
  });
