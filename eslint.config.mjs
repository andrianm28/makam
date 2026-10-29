import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// AGENTS.md, "Client import rule": a "use client" file may import only types from a domain barrel
// (`@/domain/<module>`), because the barrel reaches the database and would put `pg` in the browser bundle.
// Values come as props from the server page, or by a deep import of a pure file.
const BARREL = /^@\/domain\/[^/]+$/;
const noBarrelValuesInClient = {
  meta: { type: "problem", schema: [], messages: { barrel: "A \"use client\" file may import only types from {{source}}; import values from the module's own pure file or take them as props (AGENTS.md, Client import rule)." } },
  create(context) {
    const isClient = context.sourceCode.ast.body.some(
      (node) => node.type === "ExpressionStatement" && node.directive === "use client",
    );
    if (!isClient) return {};
    return {
      ImportDeclaration(node) {
        if (!BARREL.test(node.source.value) || node.importKind === "type") return;
        const hasValue = node.specifiers.length === 0 || node.specifiers.some((spec) => spec.importKind !== "type");
        if (hasValue) context.report({ node, messageId: "barrel", data: { source: node.source.value } });
      },
    };
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { makam: { rules: { "no-barrel-values-in-client": noBarrelValuesInClient } } },
    rules: { "makam/no-barrel-values-in-client": "error" },
  },
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
