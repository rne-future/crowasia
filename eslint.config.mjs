import nextConfig from "eslint-config-next";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  {
    ignores: [".worktrees/**", ".next/**", "dist/**", "node_modules/**"],
  },
  ...nextConfig,
  {
    name: "crowasia/module-boundaries",
    rules: {
      "no-restricted-imports": ["warn", { patterns: [] }],
    },
  },
];

export default config;
