import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/generated/**",
      "packages/db/prisma/migrations/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Plain-JS Node scripts (no TS program to supply globals).
    files: ["**/*.mjs"],
    languageOptions: {
      globals: {
        process: "readonly",
        Buffer: "readonly",
        fetch: "readonly",
        AbortSignal: "readonly",
        console: "readonly",
        URL: "readonly",
      },
    },
  },
  {
    rules: {
      // CLAUDE.md: no `any`, and no silent `@ts-ignore`.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description", "ts-ignore": true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // A user-supplied URL is a credential (CLAUDE.md). Console logging is the
      // easiest way to leak one, so it is banned outright — no carve-out for
      // console.error, which leaks exactly as well as console.log. Use @ffd/log.
      "no-console": "error",
      eqeqeq: ["error", "always"],
    },
  },
);
