/**
 * `npm run email-check -- <to>` (dev) or, in the image,
 * `node dist/email-check.mjs <to>`: sends one real test email through the
 * SumoPod SMTP relay with the container's SMTP settings, then prints its
 * Message-ID. See docs/ops/runbook.md, "Test email".
 */
import { cliFailure } from "./cli-failure";
import { emailCheckCommand } from "./email-check-command";

emailCheckCommand(process.argv.slice(2))
  .then(({ exitCode, output }) => {
    (exitCode === 0 ? console.log : console.error)(`[email-check] ${output}`);
    process.exit(exitCode);
  })
  .catch((error: unknown) => {
    console.error(`[email-check] ${cliFailure(error)}`);
    process.exit(1);
  });
