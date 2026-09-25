/**
 * `npm run seed:admin -- <phone> <email>` (dev) or, in the image,
 * `node dist/seed-admin.mjs <phone> <email>`: seeds the first Admin Platform.
 * See docs/ops/runbook.md.
 */
import { seedAdminCommand } from "./seed-admin-command";

seedAdminCommand(process.argv.slice(2))
  .then(({ exitCode, output }) => {
    (exitCode === 0 ? console.log : console.error)(`[seed:admin] ${output}`);
    process.exit(exitCode);
  })
  .catch((error: unknown) => {
    console.error("[seed:admin] failed", error);
    process.exit(1);
  });
