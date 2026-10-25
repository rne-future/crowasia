import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        crow: {
          ink: "#111113",
          ivory: "#FAF8F5",
          surface: "#FFFFFF",
          border: "#E5E0D5",
          gold: "#FFE66D",
          blue: "#1D4ED8",
          emerald: "#059669",
        },
      },
      fontFamily: {
        serif: ["Newsreader", "Georgia", "Cambria", "Times New Roman", "serif"],
        sans: [
          "Plus Jakarta Sans",
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "Menlo", "Monaco", "Consolas", "monospace"],
      },
    },
  },
  plugins: [typography],
};

export default config;
