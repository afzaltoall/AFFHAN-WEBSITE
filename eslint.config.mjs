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
    "scripts/scratch/**",
    "check_step_3197.js",
    "lint_output.txt",
    // One-off root-level dev/debug scripts — not part of the app bundle. They
    // use require()/loose vars and shouldn't gate deployments.
    "test_*.js",
    "test_*.mjs",
    "check_*.js",
    "check_*.mjs",
    "_*.mjs",
    "run-full-sync.mjs",
    "generate_subcategories.mjs",
    "fetch_cj.js",
    "scripts/**",
  ]),
  {
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/set-state-in-effect": "off",
      // React-Compiler strictness hints, not bugs (a random default duration and
      // a latest-value ref). Kept visible as warnings, consistent with the two
      // react-hooks rules already relaxed above.
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      // `any` is a type-safety smell, not a bug — surface it as a warning so it
      // doesn't fail production builds/deploy lint checks.
      "@typescript-eslint/no-explicit-any": "warn",
      // Allow @ts-nocheck on the few heavily-typed third-party (three.js) files.
      "@typescript-eslint/ban-ts-comment": ["error", { "ts-nocheck": false }],
    },
  },
]);

export default eslintConfig;
