/**
 * `npm run verify-email -- <email> --alasan "<reason>"` (dev) or, in the image,
 * `node dist/verify-email.mjs <email> --alasan "<reason>"`: marks the email on
 * record of an Admin Platform from before ADR 0004 as its Email Terverifikasi
 * (break-glass). See docs/ops/runbook.md.
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
