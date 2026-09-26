/**
 * `npm run verify-email -- <phone> --alasan "<reason>"` (dev) or, in the image,
 * `node dist/verify-email.mjs <phone> --alasan "<reason>"`: marks an Admin
 * Platform's email as Email Terverifikasi (the bootstrap path before live
 * WhatsApp). See docs/ops/runbook.md.
 */
import { cliFailure } from "./cli-failure";
import { verifyEmailCommand } from "./verify-email-command";

verifyEmailCommand(process.argv.slice(2))
  .then(({ exitCode, output }) => {
    (exitCode === 0 ? console.log : console.error)(`[verify-email] ${output}`);
    process.exit(exitCode);
  })
  .catch((error: unknown) => {
    console.error(`[verify-email] ${cliFailure(error)}`);
    process.exit(1);
  });
