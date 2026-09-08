import { defineConfig, globalIgnores } from "eslint/config";
import { fixupConfigRules } from "@eslint/compat";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  // Preserve all Next/React rules while adapting legacy plugin APIs to ESLint 10.
  ...fixupConfigRules([...nextVitals, ...nextTypescript]),
  globalIgnores([".next/**", "next-env.d.ts", "coverage/**", "test-results/**", "playwright-report/**"]),
]);
