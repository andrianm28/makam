/**
 * `npm run reset-totp -- <phone> --alasan "<reason>"` (dev) or, in the image,
 * `node dist/reset-totp.mjs <phone> --alasan "<reason>"`: resets a lost Admin
 * Platform authenticator. See docs/ops/runbook.md.
 */
import { cliFailure } from "./cli-failure";
import { resetTotpCommand } from "./reset-totp-command";

resetTotpCommand(process.argv.slice(2))
  .then(({ exitCode, output }) => {
    (exitCode === 0 ? console.log : console.error)(`[reset-totp] ${output}`);
    process.exit(exitCode);
  })
  .catch((error: unknown) => {
    console.error(`[reset-totp] ${cliFailure(error)}`);
    process.exit(1);
  });
