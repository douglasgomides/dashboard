import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

// TypeScript já verifica nomes e tipos. O lint cobre sintaxe e erros de
// controle de fluxo sem exigir reformatar o código legado.
export default [
  { ignores: ["dist/**", "node_modules/**", ".tanstack/**", "src/routeTree.gen.ts", "playwright-report/**", "test-results/**"] },
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    languageOptions: { parser: tsParser, ecmaVersion: "latest", sourceType: "module" },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "constructor-super": "error",
      "no-constant-binary-expression": "error",
      "no-dupe-else-if": "error",
      "no-duplicate-case": "error",
      "no-unreachable": "error",
      "use-isnan": "error",
      "valid-typeof": "error",
      "no-unsafe-optional-chaining": "error",
      "no-unexpected-multiline": "error",
      "no-sparse-arrays": "error",
      "no-prototype-builtins": "error",
      "no-async-promise-executor": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
