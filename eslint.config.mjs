import nextConfig from "eslint-config-next";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  ...nextConfig,
  {
    name: "crowasia/module-boundaries",
    rules: {
      "no-restricted-imports": ["warn", { patterns: [] }],
    },
  },
];

export default config;
