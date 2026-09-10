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
    // Figma Makeのデザイン参考実装(見た目の参照専用。別プロジェクトとして
    // 独自のpackage.json/tsconfigを持ち、このアプリのビルド・lint対象ではない)。
    "design-reference/**",
  ]),
]);

export default eslintConfig;
