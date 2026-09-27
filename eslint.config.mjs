import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated: worker/migrate bundles and test output.
    "dist/**",
    "test-results/**",
    "playwright-report/**",
    // Other builder agents' worktrees, checked out alongside this one on the shared host
    // (cloud sessions run from the repo root, so these are on disk even though `.git` ignores them).
    ".claude/worktrees/**",
  ]),
]);

export default eslintConfig;
