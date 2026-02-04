import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import reactHooks from "eslint-plugin-react-hooks";

export default defineConfig([
  ...nextCoreWebVitals,
  {
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      // Phase-in these stricter React 19 hooks rules gradually.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/purity": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    ".next-build/**",
    ".next-build-*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);
