/**
 * `npm run seed:admin -- --email <email> --phone <phone>` (dev) or, in the image,
 * `node dist/seed-admin.mjs --email <email> --phone <phone>`: seeds the first Admin Platform.
 * See docs/ops/runbook.md.
 */
import { cliFailure } from "./cli-failure";
import { seedAdminCommand } from "./seed-admin-command";

seedAdminCommand(process.argv.slice(2))
  .then(({ exitCode, output }) => {
    (exitCode === 0 ? console.log : console.error)(`[seed:admin] ${output}`);
    process.exit(exitCode);
  })
  .catch((error: unknown) => {
    console.error(`[seed:admin] ${cliFailure(error)}`);
    process.exit(1);
  });
